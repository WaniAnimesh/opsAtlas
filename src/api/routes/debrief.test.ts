import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createSessionRoutes } from "./sessions.js";
import { createDebriefRoutes } from "./debrief.js";
import {
  InMemorySimulationRuntimeRepository,
  SimulationRuntimeService,
} from "../../modules/simulation-runtime/index.js";
import {
  InMemoryAssessmentRepository,
  InMemoryRubricRepository,
  ScoringService,
  SCORE_DIMENSIONS,
} from "../../modules/scoring-debrief/index.js";
import type { ScenarioContentFile } from "../../types/index.js";

function scenario(): ScenarioContentFile {
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
          service_health: { api: "healthy" },
          metrics: {},
          dependencies: {},
          customer_impact: "none",
          evidence_available: [],
          active_alerts: [],
        },
      },
      actions: {
        declare: {
          id: "declare",
          label: "Declare",
          preconditions: [],
          time_cost: 1,
          effects: [],
          side_effects: [],
          delayed_effects: [],
          reversible: true,
          rationale_options: [],
        },
      },
      transitions: [],
      evidence: {},
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
  return app;
}

async function call(app: Hono, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function abandonedSession(app: Hono): Promise<string> {
  const created = await call(app, "POST", "/api/v1/sessions", { scenarioId: "sc-1" });
  const { sessionId } = (await created.json()) as { sessionId: string };
  const act = await call(app, "POST", `/api/v1/sessions/${sessionId}/actions`, {
    actionId: "declare",
    rationale: "Customer impact is high",
  });
  expect(act.status).toBe(200);
  expect((await call(app, "POST", `/api/v1/sessions/${sessionId}/abandon`)).status).toBe(200);
  return sessionId;
}

describe("debrief routes", () => {
  it("includes endedAt equal to the session end time and needs no Authorization header", async () => {
    const app = makeApp();
    const id = await abandonedSession(app);
    const res = await call(app, "GET", `/api/v1/sessions/${id}/debrief`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { endedAt: string };
    const session = (await (await call(app, "GET", `/api/v1/sessions/${id}`)).json()) as {
      endedAt: string;
    };
    expect(json.endedAt).toBe(session.endedAt);
    expect(Number.isNaN(Date.parse(json.endedAt))).toBe(false);
  });

  it("returns six separate scores and no composite after abandon", async () => {
    const app = makeApp();
    const id = await abandonedSession(app);
    const res = await call(app, "GET", `/api/v1/sessions/${id}/debrief`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    const scores = json["scores"] as Record<string, number>;
    expect(Object.keys(scores).sort()).toEqual([...SCORE_DIMENSIONS].sort());
    for (const key of ["total", "composite", "overall", "totalScore", "compositeScore"]) {
      expect(json).not.toHaveProperty(key);
      expect(scores).not.toHaveProperty(key);
    }
  });

  it("returns 409 for an active session", async () => {
    const app = makeApp();
    const created = await call(app, "POST", "/api/v1/sessions", { scenarioId: "sc-1" });
    const { sessionId } = (await created.json()) as { sessionId: string };
    const res = await call(app, "GET", `/api/v1/sessions/${sessionId}/debrief`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "SESSION_NOT_CONCLUDED",
    );
  });

  it("returns 404 for an unknown session", async () => {
    const app = makeApp();
    await abandonedSession(app);
    expect((await call(app, "GET", "/api/v1/sessions/nope/debrief")).status).toBe(404);
  });

  it("serves replay step 0 and rejects out-of-range or malformed steps with 400", async () => {
    const app = makeApp();
    const id = await abandonedSession(app);
    const base = `/api/v1/sessions/${id}/debrief/steps`;
    expect((await call(app, "GET", `${base}/0`)).status).toBe(200);
    expect((await call(app, "GET", `${base}/99`)).status).toBe(400);
    expect((await call(app, "GET", `${base}/-1`)).status).toBe(400);
    expect((await call(app, "GET", `${base}/abc`)).status).toBe(400);
  });

  it("does not shadow session routes mounted at the same prefix", async () => {
    const app = makeApp();
    const id = await abandonedSession(app);
    expect((await call(app, "GET", `/api/v1/sessions/${id}`)).status).toBe(200);
    expect((await call(app, "GET", `/api/v1/sessions/${id}/journal`)).status).toBe(200);
  });
});
