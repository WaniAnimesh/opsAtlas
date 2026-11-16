/**
 * Error factory helpers for OpsAtlas API responses.
 *
 * Each factory returns `{ statusCode, body }` where `body` conforms to
 * the `ApiError` wire shape `{ error: { code, message, details? } }`.
 *
 * References: Requirements 17.4, 17.5
 */

import type { ApiError } from "../types/index.js";

export interface ApiErrorResponse {
  statusCode: number;
  body: ApiError;
}

// ─── 404 Not Found ────────────────────────────────────────────────────────────

/**
 * The requested incident slug does not match any published incident.
 */
export function incidentNotFound(): ApiErrorResponse {
  return {
    statusCode: 404,
    body: {
      error: {
        code: "INCIDENT_NOT_FOUND",
        message: "The requested incident was not found.",
      },
    },
  };
}

/**
 * The requested scenario version does not exist.
 */
export function scenarioVersionNotFound(): ApiErrorResponse {
  return {
    statusCode: 404,
    body: {
      error: {
        code: "SCENARIO_VERSION_NOT_FOUND",
        message: "The requested scenario version was not found.",
      },
    },
  };
}

/**
 * The requested simulation session does not exist.
 */
export function sessionNotFound(): ApiErrorResponse {
  return {
    statusCode: 404,
    body: {
      error: {
        code: "SESSION_NOT_FOUND",
        message: "The requested session was not found.",
      },
    },
  };
}

// ─── 409 Conflict ─────────────────────────────────────────────────────────────

/**
 * A concurrent append computed the same sequence position. The client should
 * reload the session and retry.
 */
export function sessionConflict(): ApiErrorResponse {
  return {
    statusCode: 409,
    body: {
      error: {
        code: "SESSION_CONFLICT",
        message: "The session was modified concurrently. Reload it and try again.",
      },
    },
  };
}
// ─── 422 Unprocessable Entity ─────────────────────────────────────────────────

/**
 * An action was submitted but its preconditions were not satisfied in the
 * current scenario state.
 */
export function actionPreconditionFailed(detail: string): ApiErrorResponse {
  return {
    statusCode: 422,
    body: {
      error: {
        code: "ACTION_PRECONDITION_FAILED",
        message: "Action preconditions were not met.",
        details: detail,
      },
    },
  };
}

/**
 * The session is currently paused; actions are not permitted.
 */
export function sessionPaused(): ApiErrorResponse {
  return {
    statusCode: 422,
    body: {
      error: {
        code: "SESSION_PAUSED",
        message: "The session is paused. Resume it before submitting actions.",
      },
    },
  };
}

/**
 * No active session exists for the given context.
 */
export function noActiveSession(): ApiErrorResponse {
  return {
    statusCode: 422,
    body: {
      error: {
        code: "NO_ACTIVE_SESSION",
        message: "There is no active session.",
      },
    },
  };
}

/**
 * The rubric version required by the session is no longer available.
 */
export function rubricVersionUnavailable(version: string): ApiErrorResponse {
  return {
    statusCode: 422,
    body: {
      error: {
        code: "RUBRIC_VERSION_UNAVAILABLE",
        message: `Rubric version "${version}" is not available.`,
        details: { version },
      },
    },
  };
}

// ─── 403 Forbidden ────────────────────────────────────────────────────────────

/**
 * The Decision Journal is immutable once a session has concluded.
 */
export function journalImmutable(): ApiErrorResponse {
  return {
    statusCode: 403,
    body: {
      error: {
        code: "JOURNAL_IMMUTABLE",
        message: "The decision journal cannot be modified after a session has concluded.",
      },
    },
  };
}

// ─── 429 Too Many Requests ───────────────────────────────────────────────────

/**
 * The caller has exceeded the rate limit.
 * @param retryAfter - seconds until the caller may retry
 */
export function rateLimitExceeded(retryAfter: number): ApiErrorResponse {
  return {
    statusCode: 429,
    body: {
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
        details: { retry_after_seconds: retryAfter },
      },
    },
  };
}

// ─── 400 Bad Request ─────────────────────────────────────────────────────────

/**
 * An input field exceeds the maximum allowed character length.
 */
export function inputTooLong(field: string): ApiErrorResponse {
  return {
    statusCode: 400,
    body: {
      error: {
        code: "INPUT_TOO_LONG",
        message: `The value for field "${field}" exceeds the maximum allowed length.`,
        details: { field },
      },
    },
  };
}

/**
 * Request body or query parameters failed structural / semantic validation.
 */
export function invalidInput(detail: string): ApiErrorResponse {
  return {
    statusCode: 400,
    body: {
      error: {
        code: "INVALID_INPUT",
        message: "The request contains invalid input.",
        details: detail,
      },
    },
  };
}
