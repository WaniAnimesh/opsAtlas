/**
 * Session_Key path guard (Req 18.1, 18.2, 18.4).
 *
 * Mounted on `/:id` and `/:id/*` of the session and debrief routes. A path key
 * that is not a well-formed Session_Key returns 404 SESSION_NOT_FOUND before
 * any service or storage call. Well-formed keys are stored as `sessionKey`
 * so the error handler can log a fingerprint; the runtime still returns 404
 * for well-formed keys that do not exist.
 */

import { createMiddleware } from "hono/factory";
import { sessionNotFound } from "../errors.js";
import { isWellFormedSessionKey } from "../../modules/simulation-runtime/index.js";

export type SessionKeyVariables = {
  sessionKey: string;
};

export const sessionKeyParam = createMiddleware<{ Variables: SessionKeyVariables }>(
  async (c, next) => {
    const key = c.req.param("id");
    if (key === undefined || !isWellFormedSessionKey(key)) {
      const { statusCode, body } = sessionNotFound();
      return c.json(body, statusCode as 404);
    }
    c.set("sessionKey", key);
    await next();
    return undefined;
  },
);
