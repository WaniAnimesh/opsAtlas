/**
 * Zod-based input validation middleware for Hono routes.
 *
 * - `validateBody`  — validates the parsed JSON body against a Zod schema.
 * - `validateQuery` — validates query parameters against a Zod schema.
 *
 * Both factories return HTTP 400 INVALID_INPUT when validation fails.
 *
 * References: Requirements 17.4, 17.5
 */

import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";
import { invalidInput } from "../errors";

// ─── Character-limit constants (Req 17.5) ─────────────────────────────────────

/** Maximum length for free-text user input fields. */
export const MAX_TEXT_LENGTH = 10_000;

/** Maximum length for search query strings. */
export const MAX_SEARCH_LENGTH = 200;

// ─── Reusable schema helpers ───────────────────────────────────────────────────

/** General-purpose text field capped at MAX_TEXT_LENGTH characters. */
export const textField = z.string().max(MAX_TEXT_LENGTH);

/** Search query: must be at least 1 character, capped at MAX_SEARCH_LENGTH. */
export const searchQuery = z.string().min(1).max(MAX_SEARCH_LENGTH);

// ─── Middleware factories ──────────────────────────────────────────────────────

/**
 * Middleware factory that validates the JSON request body against `schema`.
 * On success, the parsed value is stored at `c.get('validatedBody')`.
 * On failure, responds with HTTP 400 INVALID_INPUT.
 */
export function validateBody<T>(schema: z.ZodType<T>): MiddlewareHandler {
  return async (c: Context, next) => {
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      const { statusCode, body } = invalidInput("Request body must be valid JSON.");
      return c.json(body, statusCode as Parameters<typeof c.json>[1]);
    }

    const result = schema.safeParse(rawBody);
    if (!result.success) {
      const detail = result.error.issues
        .map((e) => `${e.path.join(".") || "body"}: ${e.message}`)
        .join("; ");
      const { statusCode, body } = invalidInput(detail);
      return c.json(body, statusCode as Parameters<typeof c.json>[1]);
    }

    c.set("validatedBody", result.data);
    await next();
  };
}

/**
 * Middleware factory that validates query parameters against `schema`.
 * On success, the parsed value is stored at `c.get('validatedQuery')`.
 * On failure, responds with HTTP 400 INVALID_INPUT.
 */
export function validateQuery<T>(schema: z.ZodType<T>): MiddlewareHandler {
  return async (c: Context, next) => {
    const raw = c.req.query();
    const result = schema.safeParse(raw);
    if (!result.success) {
      const detail = result.error.issues
        .map((e) => `${e.path.join(".") || "query"}: ${e.message}`)
        .join("; ");
      const { statusCode, body } = invalidInput(detail);
      return c.json(body, statusCode as Parameters<typeof c.json>[1]);
    }

    c.set("validatedQuery", result.data);
    await next();
  };
}
