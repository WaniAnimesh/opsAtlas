import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  bindingLimiter,
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  inMemoryLimiter,
  IP_LIMIT,
  type RateLimiter,
} from "./rateLimit.js";

function setup(limiter?: RateLimiter) {
  let t = 1_000_000;
  const store = new InMemoryRateLimitStore();
  const app = new Hono();
  app.use(
    "*",
    createRateLimitMiddleware({
      limiter: limiter ?? inMemoryLimiter(store, () => t),
      resolveIp: (c) => c.req.header("x-test-ip") ?? "1.1.1.1",
    }),
  );
  app.get("/api/v1/health", (c) => c.json({ ok: true }));
  app.get("/x", (c) => c.json({ ok: true }));
  return { app, store, advance: (ms: number) => (t += ms) };
}

const from = (ip: string) => ({ headers: { "x-test-ip": ip } });

describe("rate limit middleware", () => {
  it("allows 60 requests per IP, 429 on the 61st with Retry-After and details", async () => {
    expect(IP_LIMIT).toBe(60);
    const { app } = setup();
    for (let i = 0; i < 60; i++) {
      expect((await app.request("/x", from("1.1.1.1"))).status).toBe(200);
    }
    const res = await app.request("/x", from("1.1.1.1"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    const body = (await res.json()) as {
      error: { code: string; details: { retry_after_seconds: number } };
    };
    expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.error.details.retry_after_seconds).toBe(60);
  });

  it("ignores Authorization headers: no separate authenticated or anonymous tier", async () => {
    const { app } = setup();
    for (let i = 0; i < 60; i++) {
      expect((await app.request("/x", { headers: { Authorization: `Bearer t${i}` } })).status).toBe(
        200,
      );
    }
    expect((await app.request("/x", { headers: { Authorization: "Bearer fresh" } })).status).toBe(
      429,
    );
  });

  it("counts different IPs separately", async () => {
    const { app } = setup();
    for (let i = 0; i < 60; i++) await app.request("/x", from("1.1.1.1"));
    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(429);
    expect((await app.request("/x", from("2.2.2.2"))).status).toBe(200);
  });

  it("slides the window after 60s", async () => {
    const { app, advance } = setup();
    for (let i = 0; i < 60; i++) await app.request("/x");
    advance(30_000);
    const blocked = await app.request("/x");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("30");
    advance(30_000);
    expect((await app.request("/x")).status).toBe(200);
  });

  it("exempts the health endpoint", async () => {
    const { app } = setup();
    for (let i = 0; i < 150; i++) {
      expect((await app.request("/api/v1/health")).status).toBe(200);
    }
  });

  it("evicts stale keys", async () => {
    const { app, store, advance } = setup();
    await app.request("/x");
    expect(store.size).toBe(1);
    advance(61_000);
    await app.request("/x", from("9.9.9.9"));
    expect(store.size).toBe(1); // only the new IP remains
  });
});

describe("bindingLimiter", () => {
  it("maps the Workers binding result to a 429 with the window length", async () => {
    const keys: string[] = [];
    let allow = true;
    const limiter = bindingLimiter({
      limit: async ({ key }) => {
        keys.push(key);
        return { success: allow };
      },
    });
    const { app } = setup(limiter);

    expect((await app.request("/x", from("3.3.3.3"))).status).toBe(200);
    allow = false;
    const res = await app.request("/x", from("3.3.3.3"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(keys).toEqual(["ip:3.3.3.3", "ip:3.3.3.3"]);
  });
});
