/**
 * OpsAtlas Node API entry point (local development and Docker Compose).
 *
 * Wires the shared Hono app (`createApp`) to in-memory session and assessment
 * repositories and file-backed content catalogs. Data is lost on restart.
 * Run directly (`node dist/server.js`) to start on port 3001.
 */

import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createApp, type AppDeps } from "./app.js";
import { DEFAULT_ALLOWED_ORIGINS, parseOrigins } from "./api/middleware/cors.js";
import {
  createRateLimitMiddleware,
  inMemoryLimiter,
  type ClientIpResolver,
} from "./api/middleware/rateLimit.js";
import { FileIncidentCatalogService } from "./modules/incident-catalog/file-repository.js";
import { ScenarioCatalog } from "./modules/scenario-catalog/index.js";
import { FileScenarioRepository } from "./modules/scenario-catalog/file-repository.js";
import {
  InMemoryAssessmentRepository,
  InMemoryRubricRepository,
  ScoringService,
} from "./modules/scoring-debrief/index.js";
import {
  InMemorySimulationRuntimeRepository,
  SimulationRuntimeService,
} from "./modules/simulation-runtime/index.js";

/** Socket address of the client; forwarded headers only when explicitly trusted. */
export function nodeSocketIp(trustProxyHeaders: boolean): ClientIpResolver {
  return (c: Context) => {
    if (trustProxyHeaders) {
      const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
      if (forwarded) return forwarded;
    }
    try {
      const address = getConnInfo(c).remote.address;
      if (address) return address;
    } catch {
      // No Node socket available (e.g. app.request() in tests).
    }
    return "unknown";
  };
}

/** In-memory repositories + file-backed catalogs. */
export function inMemoryDeps(): Omit<AppDeps, "rateLimit" | "allowedOrigins"> {
  const repository = new InMemorySimulationRuntimeRepository();
  const scenarioRepository = new FileScenarioRepository();
  return {
    sessions: new SimulationRuntimeService({ repository, scenarioSource: scenarioRepository }),
    scoring: new ScoringService({
      sessions: repository,
      rubrics: new InMemoryRubricRepository(),
      assessments: new InMemoryAssessmentRepository(),
    }),
    scenarios: new ScenarioCatalog(scenarioRepository),
    incidents: new FileIncidentCatalogService(),
  };
}

export function buildNodeApp(env: NodeJS.ProcessEnv = process.env): ReturnType<typeof createApp> {
  return createApp({
    ...inMemoryDeps(),
    rateLimit: createRateLimitMiddleware({
      limiter: inMemoryLimiter(),
      resolveIp: nodeSocketIp(env["TRUST_PROXY_HEADERS"] === "true"),
    }),
    allowedOrigins: parseOrigins(env["ALLOWED_ORIGINS"] ?? DEFAULT_ALLOWED_ORIGINS),
  });
}

const PORT = 3001;

/** Start the HTTP server on port 3001. */
export function startServer(): void {
  const app = buildNodeApp();
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.info(`[OpsAtlas] API server listening on http://localhost:${info.port}`);
  });
}

// Only start when run directly (CJS output: require.main === module).
if (require.main === module) {
  startServer();
}
