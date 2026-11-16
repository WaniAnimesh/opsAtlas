import { Hono } from "hono";
import type { Context } from "hono";
import { invalidInput } from "../errors.js";
import { sessionKeyParam } from "../middleware/sessionKey.js";
import { ScoringError } from "../../modules/scoring-debrief/index.js";
import type { ScoringServiceContract } from "../../modules/scoring-debrief/index.js";
import { SimulationRuntimeError } from "../../modules/simulation-runtime/index.js";

type StatusCode = Parameters<Context["json"]>[1];

/**
 * Anonymous debrief routes (Req 10.1, 10.2). Intended to be mounted at
 * /api/v1/sessions alongside the session routes; paths are distinct and GET-only.
 */
export function createDebriefRoutes(service: ScoringServiceContract): Hono {
  const routes = new Hono();

  const guard = async (c: Context, run: () => Promise<Response>): Promise<Response> => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ScoringError || error instanceof SimulationRuntimeError) {
        return c.json(error.body, error.statusCode as StatusCode);
      }
      // Req 18.5: never leak internals from unexpected failures.
      console.error(
        "[OpsAtlas] Unexpected debrief/replay failure:",
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

  // Req 18.1/18.4: malformed Session_Keys get 404 before any service call.
  routes.use("/:id/*", sessionKeyParam);

  routes.get("/:id/debrief", (c) =>
    guard(c, async () => c.json(await service.computeDebrief(c.req.param("id")), 200)),
  );

  routes.get("/:id/debrief/steps/:step", (c) =>
    guard(c, async () => {
      const raw = c.req.param("step");
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
        const { statusCode, body } = invalidInput("step must be a non-negative integer.");
        return c.json(body, statusCode as StatusCode);
      }
      return c.json(await service.getReplayStep(c.req.param("id"), Number(raw)), 200);
    }),
  );

  return routes;
}
