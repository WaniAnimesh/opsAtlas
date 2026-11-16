import { describe, expect, it, vi } from "vitest";
import { createSessionRoutes } from "./sessions.js";
import {
  InMemorySimulationRuntimeRepository,
  SimulationRuntimeService,
} from "../../modules/simulation-runtime/index.js";
import type { SimulationRuntimeServiceContract } from "../../modules/simulation-runtime/index.js";
import type { ScenarioContentFile } from "../../types/index.js";

/** 43 base64url chars; the final "A" keeps the trailing bits zero. */
const WELL_FORMED_KEY = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_A";

function scenario(): ScenarioContentFile {
  return {
    id: "sc-1",
    incident_slug: "inc",
    title: "T",
    objective: "O",
    difficulty: "beginner",
    est_duration_min: 5,
    rubric_version: "r1",
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
        blocked: {
          id: "blocked",
          label: "Blocked",
          preconditions: [{ field: "service_health.api", operator: "eq", value: "down" }],
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
  const service = new SimulationRuntimeService({
    repository: new InMemorySimulationRuntimeRepository(),
    scenarioSource: {
      getById: async (id) => (id === sc.id ? sc : null),
      getVersion: async (id, v) => (id === sc.id && v === sc.version ? sc : null),
    },
  });
  return createSessionRoutes(service);
}

type App = ReturnType<typeof makeApp>;

async function call(app: App, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createSession(app: App): Promise<string> {
  const res = await call(app, "POST", "/", { scenarioId: "sc-1" });
  return ((await res.json()) as { sessionId: string }).sessionId;
}

describe("session routes", () => {
  it("creates an anonymous session with 201 that is readable by id", async () => {
    const app = makeApp();
    const res = await call(app, "POST", "/", { scenarioId: "sc-1" });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { sessionId: string; status: string };
    expect(created.status).toBe("active");

    const get = await call(app, "GET", `/${created.sessionId}`);
    expect(get.status).toBe(200);
    const session = (await get.json()) as Record<string, unknown>;
    expect(session["id"]).toBe(created.sessionId);
    expect(Object.keys(session).filter((k) => k.toLowerCase().startsWith("user"))).toEqual([]);
  });

  it("returns 400 for an invalid body and 404 for an unknown scenario", async () => {
    const app = makeApp();
    expect((await call(app, "POST", "/", {})).status).toBe(400);
    expect((await call(app, "POST", "/", { scenarioId: "nope" })).status).toBe(404);
  });

  it("returns 404 SESSION_NOT_FOUND for an unknown session id", async () => {
    const app = makeApp();
    await createSession(app);
    for (const [method, suffix] of [
      ["GET", ""],
      ["POST", "/pause"],
      ["POST", "/abandon"],
    ] as const) {
      const res = await call(app, method, `/unknown-session${suffix}`);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "SESSION_NOT_FOUND",
      );
    }
  });

  it("returns 422 when action preconditions fail and 400 for oversized rationale", async () => {
    const app = makeApp();
    const id = await createSession(app);
    const failed = await call(app, "POST", `/${id}/actions`, {
      actionId: "blocked",
      rationale: "why",
    });
    expect(failed.status).toBe(422);
    expect(((await failed.json()) as { error: { code: string } }).error.code).toBe(
      "ACTION_PRECONDITION_FAILED",
    );

    const tooLong = await call(app, "POST", `/${id}/actions`, {
      actionId: "blocked",
      rationale: "x".repeat(10_001),
    });
    expect(tooLong.status).toBe(400);
  });

  it("records an evidence request as unavailable for unknown evidence", async () => {
    const app = makeApp();
    const id = await createSession(app);
    const res = await call(app, "POST", `/${id}/evidence`, { evidenceId: "ev-x" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("unavailable");
  });

  it("pauses and resumes a session", async () => {
    const app = makeApp();
    const id = await createSession(app);
    const paused = await call(app, "POST", `/${id}/pause`);
    expect(paused.status).toBe(200);
    expect(((await paused.json()) as { status: string }).status).toBe("paused");

    const blocked = await call(app, "POST", `/${id}/evidence`, { evidenceId: "e" });
    expect(blocked.status).toBe(422);

    const resumed = await call(app, "POST", `/${id}/resume`);
    expect(resumed.status).toBe(200);
    expect(((await resumed.json()) as { status: string }).status).toBe("active");
  });

  it("abandons a session and rejects a second abandon with 422", async () => {
    const app = makeApp();
    const id = await createSession(app);
    const res = await call(app, "POST", `/${id}/abandon`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("abandoned");
    expect((await call(app, "POST", `/${id}/abandon`)).status).toBe(422);
  });
});

describe("journal immutability (Req 9.5)", () => {
  const journalOf = async (app: App, id: string) => {
    const res = await call(app, "GET", `/${id}/journal`);
    expect(res.status).toBe(200);
    return res.json();
  };

  it("returns the journal read-only by session id", async () => {
    const app = makeApp();
    const id = await createSession(app);
    await call(app, "POST", `/${id}/evidence`, { evidenceId: "ev-x" });
    const journal = (await journalOf(app, id)) as {
      entries: { eventType: string; simTime: number; stateSnapshot: unknown }[];
    };
    expect(journal.entries).toHaveLength(1);
    expect(journal.entries[0]?.eventType).toBe("evidence_request");
    expect(journal.entries[0]?.stateSnapshot).toBeDefined();
    expect((await call(app, "GET", `/unknown-session/journal`)).status).toBe(404);
  });

  it("rejects PATCH/PUT/DELETE with 403 JOURNAL_IMMUTABLE on a concluded session", async () => {
    const app = makeApp();
    const id = await createSession(app);
    await call(app, "POST", `/${id}/evidence`, { evidenceId: "ev-x" });
    await call(app, "POST", `/${id}/abandon`);
    const before = await journalOf(app, id);

    for (const method of ["PATCH", "PUT", "DELETE"]) {
      for (const path of [
        "/actions/e1",
        "/evidence/e1",
        "/events/e1",
        "/events",
        "/journal",
        "/journal/e1",
      ]) {
        const res = await call(app, method, `/${id}${path}`, {});
        expect(res.status).toBe(403);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
          "JOURNAL_IMMUTABLE",
        );
      }
    }
    expect((await call(app, "POST", `/${id}/journal/e1`, {})).status).toBe(403);
    expect(await journalOf(app, id)).toEqual(before);
  });

  it("returns 405 for edit attempts on an active session and changes nothing", async () => {
    const app = makeApp();
    const id = await createSession(app);
    await call(app, "POST", `/${id}/evidence`, { evidenceId: "ev-x" });
    const before = await journalOf(app, id);
    const res = await call(app, "DELETE", `/${id}/journal/e1`);
    expect(res.status).toBe(405);
    expect(await journalOf(app, id)).toEqual(before);
  });

  it("returns 404 for edit attempts on unknown sessions", async () => {
    const app = makeApp();
    const unknown = await call(app, "DELETE", `/unknown-session/journal`);
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { error: { code: string } }).error.code).toBe(
      "SESSION_NOT_FOUND",
    );
    expect((await call(app, "PUT", `/nope/actions/x`)).status).toBe(404);
  });
});

describe("append-only repository", () => {
  it("rejects a duplicate (sessionId, sequencePos) append and keeps the original", async () => {
    const repo = new InMemorySimulationRuntimeRepository();
    const state = scenario().definition.states["start"]!;
    const ev = (id: string, sequencePos: number) => ({
      id,
      sessionId: "s1",
      sequencePos,
      simTime: 0,
      eventType: "action" as const,
      payload: {},
      stateSnapshot: state,
      wallTime: "2025-01-01T00:00:00.000Z",
    });
    await repo.appendEvent(ev("a", 0));
    await expect(repo.appendEvent(ev("b", 0))).rejects.toMatchObject({
      statusCode: 409,
      body: { error: { code: "SESSION_CONFLICT" } },
    });
    const session = {
      id: "s1",
      scenarioId: "sc-1",
      scenarioVersion: "1.0.0",
      rubricVersion: "r1",
      status: "active" as const,
      startedAt: "x",
      simTimeElapsed: 0,
    };
    await expect(repo.appendEventAndUpdateSession(ev("c", 0), session)).rejects.toThrow();
    expect(await repo.getSession("s1")).toBeNull();
    expect((await repo.listEvents("s1")).map((e) => e.id)).toEqual(["a"]);
  });
});

describe("unexpected engine failures (Req 18.5)", () => {
  const SECRET = "sk-secret-DB_PASSWORD=hunter2";

  function throwingApp() {
    const boom = async (): Promise<never> => {
      throw new Error(`leak ${SECRET}`);
    };
    const service = {
      getSession: async () => ({ id: WELL_FORMED_KEY, status: "active", events: [] }),
      applyAction: boom,
      requestEvidence: boom,
    } as unknown as SimulationRuntimeServiceContract;
    return createSessionRoutes(service);
  }

  it.each([
    ["actions", { actionId: "a", rationale: "r" }],
    ["evidence", { evidenceId: "e" }],
  ])("returns a generic 500 without leaking details for %s", async (path, payload) => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await call(throwingApp(), "POST", `/${WELL_FORMED_KEY}/${path}`, payload);
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text).error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("leak");
    expect(text).not.toContain("stack");
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain(SECRET);
    errSpy.mockRestore();
  });
});

describe("GET /:id/options", () => {
  function richApp() {
    const sc = scenario();
    const start = sc.definition.states["start"]!;
    start.evidence_available = ["ev-1", "ev-missing"];
    sc.definition.evidence["ev-1"] = {
      id: "ev-1",
      category: "Observable",
      type: "logs",
      time_cost: 2,
      payload: { lines: ["x"] },
    };
    sc.definition.actions["wipe"] = {
      id: "wipe",
      label: "Wipe",
      preconditions: [],
      time_cost: 1,
      effects: [{ field: "service_health.api", value: "down" }],
      side_effects: [{ field: "customer_impact", value: "high" }],
      delayed_effects: [],
      reversible: false,
      rationale_options: ["because"],
    };
    const service = new SimulationRuntimeService({
      repository: new InMemorySimulationRuntimeRepository(),
      scenarioSource: {
        getById: async (id) => (id === sc.id ? sc : null),
        getVersion: async (id, v) => (id === sc.id && v === sc.version ? sc : null),
      },
    });
    return createSessionRoutes(service);
  }

  it("lists actions, preconditions, irreversible attributes and evidence", async () => {
    const app = richApp();
    const id = await createSession(app);
    const res = await call(app, "GET", `/${id}/options`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stateId: string;
      actions: {
        id: string;
        available: boolean;
        unmetPreconditions: string[];
        modifiedAttributes?: string[];
      }[];
      evidence: { id: string; requested: boolean }[];
    };
    expect(body.stateId).toBe("start");
    const blocked = body.actions.find((a) => a.id === "blocked")!;
    expect(blocked.available).toBe(false);
    expect(blocked.unmetPreconditions[0]).toContain("service_health.api");
    expect(blocked.modifiedAttributes).toBeUndefined();
    const wipe = body.actions.find((a) => a.id === "wipe")!;
    expect(wipe.available).toBe(true);
    expect(wipe.modifiedAttributes).toEqual(["service_health.api", "customer_impact"]);
    expect(body.evidence).toEqual([
      { id: "ev-1", type: "logs", category: "Observable", time_cost: 2, requested: false },
    ]);

    await call(app, "POST", `/${id}/evidence`, { evidenceId: "ev-1" });
    const after = (await (await call(app, "GET", `/${id}/options`)).json()) as {
      evidence: { requested: boolean }[];
    };
    expect(after.evidence[0]!.requested).toBe(true);
  });

  it("returns 404 for an unknown session", async () => {
    const app = richApp();
    await createSession(app);
    expect((await call(app, "GET", `/unknown-session/options`)).status).toBe(404);
  });
});

describe("Session_Key path guard (Req 18.1, 18.4)", () => {
  function spyService() {
    const calls: string[] = [];
    const record = (name: string) => async () => {
      calls.push(name);
      throw new Error("service must not be called");
    };
    const service = {
      createSession: record("createSession"),
      getSession: record("getSession"),
      getSessionOptions: record("getSessionOptions"),
      applyAction: record("applyAction"),
      requestEvidence: record("requestEvidence"),
      pauseSession: record("pauseSession"),
      resumeSession: record("resumeSession"),
      abandonSession: record("abandonSession"),
    } as unknown as SimulationRuntimeServiceContract;
    return { app: createSessionRoutes(service), calls };
  }

  it.each([
    ["GET", "", undefined],
    ["GET", "/options", undefined],
    ["GET", "/journal", undefined],
    ["POST", "/actions", { actionId: "a", rationale: "r" }],
    ["POST", "/evidence", { evidenceId: "e" }],
    ["POST", "/pause", undefined],
    ["POST", "/resume", undefined],
    ["POST", "/abandon", undefined],
    ["DELETE", "/journal/e1", undefined],
  ] as const)(
    "returns 404 for a malformed key on %s %s without calling the service",
    async (method, suffix, payload) => {
      const { app, calls } = spyService();
      for (const key of ["s1", WELL_FORMED_KEY.slice(1), `${WELL_FORMED_KEY}A`, "a+b/c="]) {
        const res = await call(app, method, `/${encodeURIComponent(key)}${suffix}`, payload);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({
          error: { code: "SESSION_NOT_FOUND", message: "The requested session was not found." },
        });
      }
      expect(calls).toEqual([]);
    },
  );

  it("still returns 404 from the runtime for a well-formed unknown key", async () => {
    const app = makeApp();
    const res = await call(app, "GET", `/${WELL_FORMED_KEY}`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "SESSION_NOT_FOUND",
    );
  });
});

describe("pinned scenario version and anonymity (task 21.3)", () => {
  it("creates a session pinned to an existing scenarioVersion without an Authorization header", async () => {
    const app = makeApp();
    const res = await call(app, "POST", "/", { scenarioId: "sc-1", scenarioVersion: "1.0.0" });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { scenarioVersion: string };
    expect(created.scenarioVersion).toBe("1.0.0");
  });

  it("returns 404 SCENARIO_VERSION_NOT_FOUND for an unknown scenarioVersion", async () => {
    const app = makeApp();
    const res = await call(app, "POST", "/", { scenarioId: "sc-1", scenarioVersion: "9.9.9" });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "SCENARIO_VERSION_NOT_FOUND",
    );
  });

  it("rejects an oversized scenarioVersion with 400", async () => {
    const app = makeApp();
    const res = await call(app, "POST", "/", {
      scenarioId: "sc-1",
      scenarioVersion: "v".repeat(201),
    });
    expect(res.status).toBe(400);
  });

  it("passes scenarioVersion to the service and exposes no session listing endpoint", async () => {
    const createSession = vi.fn(async () => ({ id: "x" }));
    const service = { createSession } as unknown as SimulationRuntimeServiceContract;
    const app = createSessionRoutes(service);
    await call(app, "POST", "/", { scenarioId: "sc-1", scenarioVersion: "2.0.0" });
    expect(createSession).toHaveBeenCalledWith("sc-1", "2.0.0");
    expect((await call(app, "GET", "/")).status).toBe(404);
  });
});
