/**
 * Decision_Journal immutability guard (Req 9.5).
 *
 * Applies to mutating requests (PATCH / PUT / DELETE, plus POST to edit-like
 * sub-paths) under `/:id/actions/*`, `/:id/evidence/*`, `/:id/events*` and
 * `/:id/journal*`.
 *
 * Behaviour:
 *  - Unknown session -> 404 SESSION_NOT_FOUND.
 *  - Concluded session (completed | abandoned | timed_out) -> 403 JOURNAL_IMMUTABLE.
 *  - Active / paused session -> 405 METHOD_NOT_ALLOWED. The journal is
 *    append-only in the product, so no edit/delete route exists in any state.
 *  - The guard never writes anything.
 *
 * Legitimate appends (`POST /:id/actions`, `POST /:id/evidence`) and all reads
 * are not matched and pass through untouched.
 */

import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import { journalImmutable } from "../errors.js";
import { SimulationRuntimeError } from "../../modules/simulation-runtime/index.js";
import type { SimulationRuntimeServiceContract } from "../../modules/simulation-runtime/index.js";

const JOURNAL_RESOURCES = new Set(["actions", "evidence", "events", "journal"]);
const MUTATING_METHODS = new Set(["PATCH", "PUT", "DELETE"]);
const CONCLUDED = new Set(["completed", "abandoned", "timed_out"]);

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** True when the request targets a journal resource in a way that would edit/delete. */
export function isJournalMutation(method: string, tail: readonly string[]): boolean {
  const resource = tail[0];
  if (resource === undefined || !JOURNAL_RESOURCES.has(resource)) return false;
  const verb = method.toUpperCase();
  if (MUTATING_METHODS.has(verb)) return true;
  // POST to the collection root of actions/evidence is the legitimate append.
  // POST to any other sub-path (e.g. /actions/:eventId) or to events/journal is edit-like.
  if (verb === "POST") {
    if (resource === "actions" || resource === "evidence") return tail.length > 1;
    return true;
  }
  return false;
}

export function journalImmutability(service: SimulationRuntimeServiceContract): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const id = c.req.param("id");
    const segments = c.req.path.split("/").filter((s) => s !== "");
    const idx = id === undefined ? -1 : segments.findIndex((s) => safeDecode(s) === id);
    const tail = idx === -1 ? [] : segments.slice(idx + 1).map(safeDecode);

    if (!isJournalMutation(c.req.method, tail)) {
      await next();
      return undefined;
    }

    try {
      const session = await service.getSession(id as string);
      if (CONCLUDED.has(session.status)) {
        const { statusCode, body } = journalImmutable();
        return c.json(body, statusCode as 403);
      }
    } catch (error) {
      if (error instanceof SimulationRuntimeError) {
        return c.json(error.body, error.statusCode as 404);
      }
      throw error;
    }

    return c.json(
      {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Decision journal entries are append-only and cannot be modified or deleted.",
        },
      },
      405,
      { Allow: "GET" },
    );
  });
}
