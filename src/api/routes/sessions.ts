import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { journalImmutability } from "../middleware/journalImmutability.js";
import { sessionKeyParam } from "../middleware/sessionKey.js";
import { textField, validateBody } from "../middleware/validation.js";
import { SimulationRuntimeError } from "../../modules/simulation-runtime/index.js";
import type { SimulationRuntimeServiceContract } from "../../modules/simulation-runtime/index.js";

const idField = z.string().min(1).max(200);
const createSessionSchema = z.object({ scenarioId: idField, scenarioVersion: idField.optional() });
const actionSchema = z.object({ actionId: idField, rationale: textField });
const evidenceSchema = z.object({ evidenceId: idField });

type StatusCode = Parameters<Context["json"]>[1];

/**
 * Creates the anonymous simulation session routes (Req 6.1, 6.6, 7.3,
 * 8.7, 9.3, 16.4, 16.5). A session is addressed by its id alone; unknown
 * ids are reported as 404 by the runtime.
 */
export function createSessionRoutes(service: SimulationRuntimeServiceContract): Hono {
  const routes = new Hono();

  /** Runs a handler and maps runtime errors to the API error convention. */
  const guard = async (c: Context, run: () => Promise<Response>): Promise<Response> => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof SimulationRuntimeError) {
        return c.json(error.body, error.statusCode as StatusCode);
      }
      // Req 18.5: unexpected engine failures never leak message/stack/state.
      // Log only the error name server-side (no tokens or payload contents).
      console.error(
        "[OpsAtlas] Unexpected simulation runtime failure:",
        error instanceof Error ? error.name : "UnknownError",
      );
      return c.json(
        {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "An unexpected error occurred. Please try again later.",
          },
        },
        500,
      );
    }
  };
  const body = <T>(c: Context): T => c.get("validatedBody") as T;

  // Req 18.1/18.4: malformed Session_Keys get 404 before any service call.
  routes.use("/:id", sessionKeyParam);
  routes.use("/:id/*", sessionKeyParam);
  // Req 9.5: reject any edit/delete of journal entries (403 once concluded).
  routes.use("/:id/*", journalImmutability(service));

  routes.post("/", validateBody(createSessionSchema), (c) =>
    guard(c, async () => {
      const { scenarioId, scenarioVersion } = body<z.infer<typeof createSessionSchema>>(c);
      return c.json(await service.createSession(scenarioId, scenarioVersion), 201);
    }),
  );

  routes.get("/:id", (c) =>
    guard(c, async () => c.json(await service.getSession(c.req.param("id")), 200)),
  );

  /** Actions and evidence offered in the session's current state. */
  routes.get("/:id/options", (c) =>
    guard(c, async () => c.json(await service.getSessionOptions(c.req.param("id")), 200)),
  );

  /** Read-only Decision_Journal: action and evidence_request entries. */
  routes.get("/:id/journal", (c) =>
    guard(c, async () => {
      const session = await service.getSession(c.req.param("id"));
      const entries = session.events
        .filter((e) => e.eventType === "action" || e.eventType === "evidence_request")
        .map((e) => {
          const journal = (e.payload["decisionJournal"] ?? {}) as Record<string, unknown>;
          return {
            ...journal,
            id: e.id,
            sequencePos: e.sequencePos,
            eventType: e.eventType,
            simTime: e.simTime,
            wallTime: e.wallTime,
          };
        });
      return c.json({ sessionId: session.id, status: session.status, entries }, 200);
    }),
  );

  routes.post("/:id/actions", validateBody(actionSchema), (c) =>
    guard(c, async () => {
      const { actionId, rationale } = body<z.infer<typeof actionSchema>>(c);
      return c.json(await service.applyAction(c.req.param("id"), actionId, rationale), 200);
    }),
  );

  routes.post("/:id/evidence", validateBody(evidenceSchema), (c) =>
    guard(c, async () => {
      const { evidenceId } = body<z.infer<typeof evidenceSchema>>(c);
      return c.json(await service.requestEvidence(c.req.param("id"), evidenceId), 200);
    }),
  );

  routes.post("/:id/pause", (c) =>
    guard(c, async () => c.json(await service.pauseSession(c.req.param("id")), 200)),
  );

  routes.post("/:id/resume", (c) =>
    guard(c, async () => c.json(await service.resumeSession(c.req.param("id")), 200)),
  );

  routes.post("/:id/abandon", (c) =>
    guard(c, async () => c.json(await service.abandonSession(c.req.param("id")), 200)),
  );

  return routes;
}
