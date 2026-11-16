/**
 * CORS allowlist (design D7). The site calls the API cross-origin with no
 * cookies and no credentials mode. Origins outside `ALLOWED_ORIGINS` receive
 * no CORS headers, so browsers block the response. CORS is a browser policy,
 * not access control; the Session_Key remains the only access control.
 */
import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

export const DEFAULT_ALLOWED_ORIGINS = "http://localhost:3000";

/** Parse a comma-separated `ALLOWED_ORIGINS` value; blanks and trailing slashes are dropped. */
export function parseOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin.length > 0);
}

export function corsAllowlist(allowed: readonly string[]): MiddlewareHandler {
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    exposeHeaders: ["Retry-After", "X-Request-Id"],
    credentials: false,
    maxAge: 600,
  });
}
