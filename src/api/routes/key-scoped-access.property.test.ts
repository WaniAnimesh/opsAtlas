import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { Hono } from "hono";
import { createSessionRoutes } from "./sessions.js";
import { createDebriefRoutes } from "./debrief.js";
import {
  InMemorySimulationRuntimeRepository,
  SimulationRuntimeService,
} from "../../modules/simulation-runtime/index.js";
import { base64UrlEncode } from "../../modules/simulation-runtime/session-key.js";
import {
  InMemoryAssessmentRepository,
  InMemoryRubricRepository,
  ScoringService,
} from "../../modules/scoring-debrief/index.js";
import type { ScenarioContentFile } from "../../types/index.js";

function scenario(): ScenarioContentFile {
  const action = (id: string) => ({
    id,
    label: id,
    preconditions: [],
    time_cost: 1,
    effects: [],
    side_effects: [],
    delayed_effects: [],
    reversible: true,
    rationale_options: [],
  });
  return {
    id: "sc-1",
    incident_slug: "inc",
    title: "T",
    objective: "O",
    difficulty: "beginner",
    est_duration_min: 5,
    rubric_version: "1.0.0",
    skill_tags: ["x"],
    version: "1.0.0",
    definition: {
      initial_state_id: "start",
      states: {
        start: {
          id: "start",
          is_terminal: false,
          service_health: { api: "degraded" },
          metrics: {},
          dependencies: {},
          customer_impact: "none",
          evidence_available: ["ev-1"],
          active_alerts: [],
        },
      },
      actions: { wait: action("wait") },
      transitions: [],
      evidence: {
        "ev-1": {
          id: "ev-1",
          category: "Observable",
          type: "logs",
          time_cost: 1,
          payload: { l: 1 },
        },
      },
    },
  };
}

function makeApp() {
  const sc = scenario();
  const repository = new InMemorySimulationRuntimeRepository();
  const sessions = new SimulationRuntimeService({
    repository,
    scenarioSource: {
      getById: async (id) => (id === sc.id ? sc : null),
      getVersion: async (id, v) => (id === sc.id && v === sc.version ? sc : null),
    },
  });
  const scoring = new ScoringService({
    sessions: repository,
    rubrics: new InMemoryRubricRepository(),
    assessments: new InMemoryAssessmentRepository(),
  });
  const app = new Hono();
  app.route("/api/v1/sessions", createSessionRoutes(sessions));
  app.route("/api/v1/sessions", createDebriefRoutes(scoring));
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { call };
}

type Route = readonly [method: string, suffix: string, body?: unknown];

const ROUTES: readonly Route[] = [
  ["GET", ""],
  ["GET", "/options"],
  ["GET", "/journal"],
  ["GET", "/debrief"],
  ["GET", "/debrief/steps/0"],
  ["POST", "/actions", { actionId: "wait", rationale: "r" }],
  ["POST", "/evidence", { evidenceId: "ev-1" }],
  ["POST", "/pause"],
  ["POST", "/resume"],
  ["POST", "/abandon"],
];

const NOT_FOUND = {
  error: { code: "SESSION_NOT_FOUND", message: "The requested session was not found." },
};

const pathKeyArb = fc.oneof(
  // Well-formed random keys.
  fc.uint8Array({ minLength: 32, maxLength: 32 }).map(base64UrlEncode),
  // Keys of other formats.
  fc.uuid(),
  fc.stringMatching(/^[A-Za-z0-9_-]{1,60}$/),
  // Arbitrary malformed strings (dot segments would be normalised away by URL parsing).
  fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s !== "." && s !== ".."),
);

describe("Property 13: Key-Scoped Session Access", () => {
  // Feature: opsatlas-platform, Property 13: Key-Scoped Session Access
  // **Validates: Requirements 16.6, 18.1, 18.4**
  it(
    "returns 404 SESSION_NOT_FOUND with no session data for any key that is not an existing session's key",
    { timeout: 60000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          fc.array(pathKeyArb, { minLength: 1, maxLength: 5 }),
          fc.constantFrom(...ROUTES),
          async (sessionCount, pathKeys, [method, suffix, body]) => {
            const { call } = makeApp();
            const existing = new Set<string>();
            for (let i = 0; i < sessionCount; i++) {
              const res = await call("POST", "/api/v1/sessions", { scenarioId: "sc-1" });
              existing.add(((await res.json()) as { sessionId: string }).sessionId);
            }
            for (const key of pathKeys) {
              fc.pre(!existing.has(key));
              const res = await call(
                method,
                `/api/v1/sessions/${encodeURIComponent(key)}${suffix}`,
                body,
              );
              const text = await res.text();
              expect(res.status, `${method} ${suffix} key=${JSON.stringify(key)}`).toBe(404);
              expect(JSON.parse(text)).toEqual(NOT_FOUND);
              for (const k of existing) expect(text).not.toContain(k);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    "responses to requests carrying A's key contain only A's data and never B's key",
    { timeout: 60000 },
    async () => {
      const stepArb = fc.constantFrom<Route>(
        ["POST", "/actions", { actionId: "wait", rationale: "r" }],
        ["POST", "/evidence", { evidenceId: "ev-1" }],
        ["POST", "/pause"],
        ["POST", "/resume"],
      );
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }),
          fc.array(fc.tuple(fc.nat(), stepArb), { maxLength: 8 }),
          fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
          async (count, steps, abandon) => {
            const { call } = makeApp();
            const keys: string[] = [];
            for (let i = 0; i < count; i++) {
              const res = await call("POST", "/api/v1/sessions", { scenarioId: "sc-1" });
              keys.push(((await res.json()) as { sessionId: string }).sessionId);
            }
            const others = (key: string) => keys.filter((k) => k !== key);
            const check = async (key: string, [method, suffix, body]: Route) => {
              const res = await call(method, `/api/v1/sessions/${key}${suffix}`, body);
              const text = await res.text();
              for (const other of others(key)) expect(text).not.toContain(other);
              if (res.status === 200) {
                const json = JSON.parse(text) as Record<string, unknown>;
                for (const field of ["id", "sessionId"]) {
                  if (field in json) expect(json[field]).toBe(key);
                }
                if (Array.isArray(json["events"])) {
                  for (const e of json["events"] as { sessionId: string }[]) {
                    expect(e.sessionId).toBe(key);
                  }
                }
              }
            };

            for (const [n, step] of steps) await check(keys[n % keys.length]!, step);
            for (let i = 0; i < keys.length; i++) {
              if (abandon[i]) await check(keys[i]!, ["POST", "/abandon"]);
            }
            for (const key of keys) {
              for (const route of ROUTES.filter(([m]) => m === "GET")) await check(key, route);
            }
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});
