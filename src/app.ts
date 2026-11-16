/**
 * Shared, runtime-neutral Hono application (design D12).
 *
 * Used by both the Node server (`src/server.ts`) and the Cloudflare Worker
 * (`src/worker.ts`). This file and everything it imports must not import
 * `node:*` modules or `@hono/node-server`; environment-specific wiring is
 * injected through `AppDeps`.
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { corsAllowlist } from "./api/middleware/cors.js";
import { redactingErrorHandler } from "./api/middleware/errorHandler.js";
import { requestIdMiddleware } from "./api/middleware/requestId.js";
import { createDebriefRoutes } from "./api/routes/debrief.js";
import { createIncidentCatalogRoutes } from "./api/routes/incidents.js";
import { createScenarioCatalogRoutes } from "./api/routes/scenarios.js";
import { createSessionRoutes } from "./api/routes/sessions.js";
import type { IncidentCatalogService } from "./modules/incident-catalog/index.js";
import type { ScenarioCatalogService } from "./modules/scenario-catalog/index.js";
import type { ScoringServiceContract } from "./modules/scoring-debrief/index.js";
import type { SimulationRuntimeServiceContract } from "./modules/simulation-runtime/index.js";

export interface AppDeps {
  sessions: SimulationRuntimeServiceContract;
  scoring: ScoringServiceContract;
  scenarios: ScenarioCatalogService;
  incidents: IncidentCatalogService;
  /** Rate limit middleware; `/api/v1/health` must be exempt. */
  rateLimit: MiddlewareHandler;
  allowedOrigins: readonly string[];
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use("*", requestIdMiddleware);
  app.use("*", corsAllowlist(deps.allowedOrigins)); // answers OPTIONS preflight
  app.use("*", deps.rateLimit); // health exempt

  app.get("/api/v1/health", (c) =>
    c.json({ status: "ok", timestamp: new Date().toISOString() }, 200),
  );
  app.route("/api/v1/incidents", createIncidentCatalogRoutes(deps.incidents));
  app.route("/api/v1/scenarios", createScenarioCatalogRoutes(deps.scenarios));
  app.route("/api/v1/sessions", createSessionRoutes(deps.sessions));
  app.route("/api/v1/sessions", createDebriefRoutes(deps.scoring));

  // Logs only error name, request id and a Session_Key fingerprint (Req 18.3).
  app.onError(redactingErrorHandler);

  return app;
}
