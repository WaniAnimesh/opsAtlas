/**
 * Hono middleware that generates a UUID v4 per request, sets it as the
 * `X-Request-Id` response header, and makes it available via `c.get('requestId')`.
 *
 * Usage:
 *   app.use('*', requestIdMiddleware);
 *   // Then in a handler: const id = c.get('requestId');
 */

import { createMiddleware } from "hono/factory";

// Extend the Hono variable type so `c.get('requestId')` is typed.
export type RequestIdVariables = {
  requestId: string;
};

export const requestIdMiddleware = createMiddleware<{
  Variables: RequestIdVariables;
}>(async (c, next) => {
  const id = crypto.randomUUID();
  c.set("requestId", id);
  await next();
  c.header("X-Request-Id", id);
});
