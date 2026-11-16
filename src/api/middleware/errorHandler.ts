/**
 * Redacting global error handler (Req 18.3, 18.5).
 *
 * Logs only the error name, the request id and, when a Session_Key is in
 * scope, its SHA-256 fingerprint. It never logs the error message, stack,
 * request path or the key itself, and never returns internals to the client.
 */

import type { Context, ErrorHandler } from "hono";
import { sessionKeyFingerprint } from "../../modules/simulation-runtime/index.js";
import type { ApiError } from "../../types/index.js";

type StatusCode = Parameters<Context["json"]>[1];

const INTERNAL_ERROR: ApiError = {
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred. Please try again later.",
  },
};

function readVariable(c: Context, name: string): string | undefined {
  const value: unknown = c.get(name);
  return typeof value === "string" ? value : undefined;
}

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) return false;
  const error = (value as Record<string, unknown>)["error"];
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  return typeof record["code"] === "string" && typeof record["message"] === "string";
}

export function createErrorHandler(): ErrorHandler {
  return async (err, c) => {
    const sessionKey = readVariable(c, "sessionKey");
    const entry: Record<string, string> = {
      name: err instanceof Error ? err.name : "UnknownError",
      requestId: readVariable(c, "requestId") ?? "unknown",
    };
    if (sessionKey !== undefined) {
      entry["sessionKeyFingerprint"] = await sessionKeyFingerprint(sessionKey);
    }
    console.error("[OpsAtlas] Unhandled error:", JSON.stringify(entry));

    // Errors from the API error factories carry a status code and a safe body.
    const asRecord = err as unknown as Record<string, unknown>;
    const statusCode = asRecord["statusCode"];
    const body = asRecord["body"];
    if (
      typeof statusCode === "number" &&
      statusCode >= 400 &&
      statusCode < 500 &&
      isApiError(body)
    ) {
      return c.json(body, statusCode as StatusCode);
    }
    return c.json(INTERNAL_ERROR, 500);
  };
}

export const redactingErrorHandler = createErrorHandler();
