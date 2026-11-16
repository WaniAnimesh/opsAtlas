/**
 * Rate limiting middleware (Requirements 17.2, 17.3, 17.4).
 *
 * One tier only: 60 requests per 60 seconds per client IP. `/api/v1/health`
 * is exempt. The limiter backend is injectable:
 *  - `inMemoryLimiter()` (sliding log, per process) for the Node server and tests.
 *  - `bindingLimiter(binding)` for the Cloudflare Workers Rate Limiting binding.
 *
 * Runtime-neutral: no `node:*` imports. The Node-only socket IP resolver lives
 * in `src/server.ts`.
 */

import { createMiddleware } from "hono/factory";
import type { Context, MiddlewareHandler } from "hono";
import { rateLimitExceeded } from "../errors.js";

export const WINDOW_MS = 60_000;
export const IP_LIMIT = 60;
export const HEALTH_PATH = "/api/v1/health";

export interface WindowState {
  count: number;
  /** Timestamp (ms) of the oldest request still inside the window, if any. */
  oldest: number | undefined;
}

export interface RateLimitStore {
  /** Current in-window state for a key. */
  peek(key: string, windowMs: number, now: number): WindowState;
  /** Record one request for a key at `now`. */
  record(key: string, windowMs: number, now: number): void;
}

/**
 * In-memory sliding-log store. Memory is bounded: timestamps outside the
 * window are pruned, empty keys are swept periodically, and the key count is
 * capped (oldest-inserted keys evicted first).
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(private readonly maxKeys = 10_000) {}

  peek(key: string, windowMs: number, now: number): WindowState {
    const list = this.entries.get(key);
    if (!list) return { count: 0, oldest: undefined };
    this.prune(list, windowMs, now);
    if (list.length === 0) {
      this.entries.delete(key);
      return { count: 0, oldest: undefined };
    }
    return { count: list.length, oldest: list[0] };
  }

  record(key: string, windowMs: number, now: number): void {
    this.sweep(windowMs, now);
    let list = this.entries.get(key);
    if (!list) {
      if (this.entries.size >= this.maxKeys) {
        const first = this.entries.keys().next();
        if (!first.done) this.entries.delete(first.value);
      }
      list = [];
      this.entries.set(key, list);
    }
    list.push(now);
  }

  /** Number of tracked keys (for tests / monitoring). */
  get size(): number {
    return this.entries.size;
  }

  private prune(list: number[], windowMs: number, now: number): void {
    let i = 0;
    while (i < list.length && (list[i] as number) <= now - windowMs) i++;
    if (i > 0) list.splice(0, i);
  }

  private sweep(windowMs: number, now: number): void {
    if (now - this.lastSweep < windowMs) return;
    this.lastSweep = now;
    for (const [key, list] of this.entries) {
      this.prune(list, windowMs, now);
      if (list.length === 0) this.entries.delete(key);
    }
  }
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Backend that decides whether one more request for `key` is allowed. */
export interface RateLimiter {
  allow(key: string): Promise<RateLimitDecision>;
}

/** Local development / tests: sliding log of 60 requests per 60 seconds. */
export function inMemoryLimiter(
  store: RateLimitStore = new InMemoryRateLimitStore(),
  now: () => number = Date.now,
): RateLimiter {
  return {
    allow: async (key) => {
      const t = now();
      const state = store.peek(key, WINDOW_MS, t);
      if (state.count >= IP_LIMIT && state.oldest !== undefined) {
        const retryMs = state.oldest + WINDOW_MS - t;
        // Rejected requests are not recorded, so a blocked client recovers as
        // soon as its oldest allowed request leaves the window.
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
      }
      store.record(key, WINDOW_MS, t);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

/** The part of the Cloudflare Workers Rate Limiting binding used here. */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Production: Workers Rate Limiting binding (configured as 60 per 60 s in
 * `wrangler.toml`). The binding reports no reset time, so a rejection returns
 * the window length as an upper bound.
 */
export function bindingLimiter(binding: RateLimitBinding): RateLimiter {
  return {
    allow: async (key) => {
      const { success } = await binding.limit({ key });
      return { allowed: success, retryAfterSeconds: success ? 0 : WINDOW_MS / 1000 };
    },
  };
}

export type ClientIpResolver = (c: Context) => string;

/** Cloudflare sets `CF-Connecting-IP`; clients cannot control it on the Worker. */
export const cfConnectingIp: ClientIpResolver = (c) =>
  c.req.header("cf-connecting-ip")?.trim() || "unknown";

export interface RateLimitMiddlewareOptions {
  limiter: RateLimiter;
  resolveIp: ClientIpResolver;
}

export function createRateLimitMiddleware(options: RateLimitMiddlewareOptions): MiddlewareHandler {
  const { limiter, resolveIp } = options;

  return createMiddleware(async (c, next) => {
    if (c.req.path === HEALTH_PATH) return next();

    const decision = await limiter.allow(`ip:${resolveIp(c)}`);
    if (!decision.allowed) {
      const retryAfter = Math.max(1, decision.retryAfterSeconds);
      const { statusCode, body } = rateLimitExceeded(retryAfter);
      c.header("Retry-After", String(retryAfter));
      return c.json(body, statusCode as 429);
    }
    return next();
  });
}
