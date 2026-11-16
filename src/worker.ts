/**
 * Cloudflare Worker entry (design D12): the shared Hono app backed by D1, the
 * bundled content and the Workers Rate Limiting binding, plus the daily purge.
 *
 * Nothing imported from here may use Node-only modules (checked by
 * `npm run worker:dry-run`). Worker runtime types are declared locally so the
 * global Workers type definitions do not clash with the Node ones.
 */
import type { ExecutionContext } from "hono";
import { createApp, type AppDeps } from "./app.js";
import { parseOrigins } from "./api/middleware/cors.js";
import {
  bindingLimiter,
  cfConnectingIp,
  createRateLimitMiddleware,
  type RateLimitBinding,
} from "./api/middleware/rateLimit.js";
import type { ContentBundle } from "./content/bundle.js";
import bundleJson from "./generated/content-bundle.json";
import { BundledIncidentRepository, IncidentCatalog } from "./modules/incident-catalog/index.js";
import { BundledScenarioRepository, ScenarioCatalog } from "./modules/scenario-catalog/index.js";
import { D1AssessmentRepository } from "./modules/scoring-debrief/d1-assessment-repository.js";
import { BundledRubricRepository, ScoringService } from "./modules/scoring-debrief/index.js";
import {
  D1SimulationRuntimeRepository,
  purgeInactiveSessions,
} from "./modules/simulation-runtime/d1-repository.js";
import { SimulationRuntimeService } from "./modules/simulation-runtime/index.js";
import type { D1Database } from "./types/d1.js";

const bundle = bundleJson as unknown as ContentBundle;

export interface Env {
  DB: D1Database;
  RATE_LIMITER: RateLimitBinding;
  ALLOWED_ORIGINS: string;
}

/** The Workers `ExecutionContext` (Hono's structural type for it). */
export type WorkerExecutionContext = ExecutionContext;

/** The part of the Workers `ScheduledController` used here. */
export interface WorkerScheduledEvent {
  scheduledTime: number;
  cron?: string;
}

export function workerDeps(env: Env): AppDeps {
  const repository = new D1SimulationRuntimeRepository(env.DB);
  const scenarioRepository = new BundledScenarioRepository(bundle);
  return {
    sessions: new SimulationRuntimeService({ repository, scenarioSource: scenarioRepository }),
    scoring: new ScoringService({
      sessions: repository,
      rubrics: new BundledRubricRepository(bundle),
      assessments: new D1AssessmentRepository(env.DB),
    }),
    scenarios: new ScenarioCatalog(scenarioRepository),
    incidents: new IncidentCatalog(new BundledIncidentRepository(bundle)),
    rateLimit: createRateLimitMiddleware({
      limiter: bindingLimiter(env.RATE_LIMITER),
      resolveIp: cfConnectingIp,
    }),
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS),
  };
}

let cached: { db: D1Database; app: ReturnType<typeof createApp> } | undefined;

function appFor(env: Env): ReturnType<typeof createApp> {
  if (cached?.db !== env.DB) {
    cached = { db: env.DB, app: createApp(workerDeps(env)) };
  }
  return cached.app;
}

export default {
  fetch: (request: Request, env: Env, ctx: WorkerExecutionContext): Response | Promise<Response> =>
    appFor(env).fetch(request, env, ctx),

  scheduled: (event: WorkerScheduledEvent, env: Env, ctx: WorkerExecutionContext): void => {
    ctx.waitUntil(purgeInactiveSessions(env.DB, new Date(event.scheduledTime)));
  },
};
