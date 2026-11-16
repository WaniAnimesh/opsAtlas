import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { createSessionRoutes } from "./sessions.js";
import {
  InMemorySimulationRuntimeRepository,
  SimulationRuntimeService,
} from "../../modules/simulation-runtime/index.js";
import type { ScenarioContentFile, ScenarioState } from "../../types/index.js";

const NOW = 1_800_000_000;

function state(id: string, isTerminal: boolean): ScenarioState {
  return {
    id,
    is_terminal: isTerminal,
    service_health: { api: isTerminal ? "healthy" : "degraded" },
    metrics: {},
    dependencies: {},
    customer_impact: "none",
    evidence_available: ["ev-1"],
    active_alerts: [],
  };
}

/** start --finish--> done (terminal); wait/evidence cost 1 each; limit of 3 sim-minutes. */
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
    time_limit_min: 3,
    rubric_version: "r1",
    skill_tags: ["x"],
    version: "1.0.0",
    definition: {
      initial_state_id: "start",
      states: { start: state("start", false), done: state("done", true) },
      actions: { wait: action("wait"), finish: action("finish") },
      transitions: [
        {
          from_state_id: "start",
          trigger: "finish",
          guard: null,
          to_state_id: "done",
          effects: [],
          delayed_effects: [],
        },
      ],
      evidence: {
        "ev-1": {
          id: "ev-1",
          category: "Observable",
          type: "logs",
          time_cost: 1,
          payload: { line: "x" },
        },
      },
    },
  };
}

function makeHarness() {
  const sc = scenario();
  const repository = new InMemorySimulationRuntimeRepository();
  let idCounter = 0;
  let clockTick = 0;
  const service = new SimulationRuntimeService({
    repository,
    scenarioSource: {
      getById: async (id) => (id === sc.id ? sc : null),
      getVersion: async (id, v) => (id === sc.id && v === sc.version ? sc : null),
    },
    idGenerator: () => `id-${++idCounter}`,
    clock: () => new Date(NOW * 1000 + ++clockTick * 1000),
  });
  const app = createSessionRoutes(service);
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { repository, call };
}

type Conclusion = "completed" | "abandoned" | "timed_out";
type Step = "wait" | "evidence";

const sessionPlanArb = fc.record({
  prefix: fc.array(fc.constantFrom<Step>("wait", "evidence"), { maxLength: 2 }),
  conclusion: fc.constantFrom<Conclusion>("completed", "abandoned", "timed_out"),
});

const segmentArb = fc.stringMatching(/^[a-z0-9-]{1,8}$/);
const jsonBodyArb = fc.option(
  fc.oneof(
    fc.constant({}),
    fc.dictionary(segmentArb, fc.oneof(fc.string({ maxLength: 20 }), fc.integer(), fc.boolean())),
    fc.array(fc.integer(), { maxLength: 3 }),
  ),
  { nil: undefined },
);

const attemptArb = fc
  .record({
    method: fc.constantFrom("PATCH", "PUT", "DELETE", "POST"),
    resource: fc.constantFrom("actions", "evidence", "events", "journal"),
    tail: fc.array(segmentArb, { maxLength: 2 }),
    body: jsonBodyArb,
  })
  .filter(
    // POST to the bare actions/evidence collection is the legitimate append, not a mutation.
    (a) =>
      !(
        a.method === "POST" &&
        (a.resource === "actions" || a.resource === "evidence") &&
        a.tail.length === 0
      ),
  );

describe("Property 8: Decision Journal Immutability", () => {
  // Feature: opsatlas-platform, Property 8: Decision Journal Immutability
  // **Validates: Requirements 9.5**
  it(
    "rejects every journal edit/delete on a concluded session with 403 JOURNAL_IMMUTABLE and leaves the journal unchanged",
    { timeout: 60000 },
    async () => {
      const seen = new Set<string>();

      await fc.assert(
        fc.asyncProperty(
          sessionPlanArb,
          fc.array(attemptArb, { minLength: 1, maxLength: 8 }),
          async (plan, attempts) => {
            const { repository, call } = makeHarness();
            const created = await call("POST", "/", { scenarioId: "sc-1" });
            expect(created.status).toBe(201);
            const id = ((await created.json()) as { sessionId: string }).sessionId;

            for (const step of plan.prefix) {
              const res =
                step === "wait"
                  ? await call("POST", `/${id}/actions`, { actionId: "wait", rationale: "r" })
                  : await call("POST", `/${id}/evidence`, { evidenceId: "ev-1" });
              expect(res.status).toBe(200);
            }

            if (plan.conclusion === "completed") {
              const res = await call("POST", `/${id}/actions`, {
                actionId: "finish",
                rationale: "r",
              });
              expect(res.status).toBe(200);
            } else if (plan.conclusion === "abandoned") {
              expect((await call("POST", `/${id}/abandon`)).status).toBe(200);
            } else {
              // Wait until elapsed sim time exceeds the 3 minute limit.
              for (let i = 0; i < 5; i++) {
                const s = (await (await call("GET", `/${id}`)).json()) as { status: string };
                if (s.status === "timed_out") break;
                await call("POST", `/${id}/actions`, { actionId: "wait", rationale: "r" });
              }
            }

            const concluded = (await (await call("GET", `/${id}`)).json()) as { status: string };
            expect(concluded.status).toBe(plan.conclusion);
            seen.add(concluded.status);

            const journalBefore = await (await call("GET", `/${id}/journal`)).json();
            const eventsBefore = await repository.listEvents(id);
            const sessionBefore = await (await call("GET", `/${id}`)).json();

            for (const a of attempts) {
              const path = `/${id}/${[a.resource, ...a.tail].join("/")}`;
              const res = await call(a.method, path, a.body);
              expect(res.status, `${a.method} ${path}`).toBe(403);
              expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
                "JOURNAL_IMMUTABLE",
              );
            }

            expect(await (await call("GET", `/${id}/journal`)).json()).toEqual(journalBefore);
            expect(await repository.listEvents(id)).toEqual(eventsBefore);
            expect(await (await call("GET", `/${id}`)).json()).toEqual(sessionBefore);
          },
        ),
        { numRuns: 100, seed: 8_005 },
      );

      // Non-vacuity: every concluded status was exercised.
      expect([...seen].sort()).toEqual(["abandoned", "completed", "timed_out"]);
    },
  );
});
