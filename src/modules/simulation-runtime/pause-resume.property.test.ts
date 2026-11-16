import * as fc from "fast-check";

import type {
  Condition,
  DelayedEffect,
  EvidenceItem,
  ScenarioAction,
  ScenarioContentFile,
  ScenarioState,
} from "../../types/index.js";
import {
  InMemorySimulationRuntimeRepository,
  SimulationRuntimeService,
  type ScenarioVersionSource,
  type SessionState,
} from "./index.js";

type Step = { kind: "action"; index: number } | { kind: "evidence"; index: number };

type PauseModel = {
  actions: Array<Omit<ScenarioAction, "id">>;
  evidence: Array<Omit<EvidenceItem, "id">>;
  steps: Step[][];
};

const effectArbitrary = fc.record({
  field: fc.constantFrom(
    "metrics.latency",
    "metrics.errors",
    "customer_impact",
    "service_health.api",
  ),
  value: fc.oneof(fc.integer({ min: -50, max: 50 }), fc.string({ maxLength: 8 })),
});

const delayedArbitrary: fc.Arbitrary<DelayedEffect> = fc.record({
  delay: fc.integer({ min: 1, max: 30 }),
  effect: effectArbitrary,
});

const actionArbitrary = fc.record({
  label: fc.string({ minLength: 1, maxLength: 10 }),
  preconditions: fc.constant([] as Condition[]),
  time_cost: fc.integer({ min: 0, max: 15 }),
  effects: fc.array(effectArbitrary, { maxLength: 2 }),
  side_effects: fc.array(effectArbitrary, { maxLength: 2 }),
  delayed_effects: fc.array(delayedArbitrary, { maxLength: 2 }),
  reversible: fc.boolean(),
  rationale_options: fc.constant([] as string[]),
});

const evidenceArbitrary = fc.record({
  category: fc.constantFrom<EvidenceItem["category"]>("Observable", "Indicator", "Artifact"),
  type: fc.constantFrom<EvidenceItem["type"]>("logs", "metrics", "topology", "change_history"),
  time_cost: fc.integer({ min: 0, max: 15 }),
  payload: fc.jsonValue(),
});

const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constant("action" as const), index: fc.nat({ max: 20 }) }),
  fc.record({ kind: fc.constant("evidence" as const), index: fc.nat({ max: 20 }) }),
);

// Each inner array is the work performed before one pause/resume cycle.
const modelArbitrary: fc.Arbitrary<PauseModel> = fc.record({
  actions: fc.array(actionArbitrary, { minLength: 1, maxLength: 4 }),
  evidence: fc.array(evidenceArbitrary, { minLength: 1, maxLength: 3 }),
  steps: fc.array(fc.array(stepArbitrary, { maxLength: 6 }), { minLength: 1, maxLength: 4 }),
});

function buildScenario(model: PauseModel): ScenarioContentFile {
  const initialState: ScenarioState = {
    id: "initial",
    is_terminal: false,
    service_health: { api: "healthy" },
    metrics: { latency: 10, errors: 0 },
    dependencies: {},
    customer_impact: "none",
    evidence_available: model.evidence.map((_, index) => `evidence-${index}`),
    active_alerts: [],
  };
  return {
    id: "pause-resume-scenario",
    incident_slug: "pause-resume-incident",
    title: "Pause resume property scenario",
    objective: "Verify paused state preservation.",
    difficulty: "beginner",
    est_duration_min: 5,
    rubric_version: "rubric-property-1",
    skill_tags: ["observability"],
    version: "1.0.0",
    definition: {
      initial_state_id: initialState.id,
      states: { [initialState.id]: initialState },
      actions: Object.fromEntries(
        model.actions.map((action, index) => [
          `action-${index}`,
          { ...action, id: `action-${index}` },
        ]),
      ),
      transitions: [],
      evidence: Object.fromEntries(
        model.evidence.map((item, index) => [
          `evidence-${index}`,
          { ...item, id: `evidence-${index}` },
        ]),
      ),
    },
  };
}

function boundary(session: SessionState) {
  return {
    simTimeElapsed: session.simTimeElapsed,
    state: session.state,
    pendingEvents: session.pendingEvents,
  };
}

describe("SimulationRuntimeService pause/resume state preservation", () => {
  // Feature: opsatlas-platform, Property 10: Paused Session State Preservation
  // **Validates: Requirements 16.2**
  it("preserves sim time, pending events, state and journal across pause and resume", async () => {
    let totalPendingSeen = 0;
    let totalMetricChanges = 0;
    let totalCycles = 0;

    await fc.assert(
      fc.asyncProperty(modelArbitrary, async (model) => {
        const scenario = buildScenario(model);
        const source: ScenarioVersionSource = {
          getById: async (id) => (id === scenario.id ? scenario : null),
          getVersion: async (id, v) =>
            id === scenario.id && v === scenario.version ? scenario : null,
        };
        const repository = new InMemorySimulationRuntimeRepository();
        let idCounter = 0;
        let clockTick = 0;
        const service = new SimulationRuntimeService({
          repository,
          scenarioSource: source,
          idGenerator: () => `id-${idCounter++}`,
          clock: () => new Date(Date.UTC(2025, 0, 1, 0, 0, clockTick++)),
        });
        const handle = await service.createSession(scenario.id);
        const sessionId = handle.sessionId;

        for (const cycle of model.steps) {
          for (const step of cycle) {
            if (step.kind === "action") {
              await service.applyAction(
                sessionId,
                `action-${step.index % model.actions.length}`,
                "because",
              );
            } else {
              await service.requestEvidence(
                sessionId,
                `evidence-${step.index % model.evidence.length}`,
              );
            }
          }

          const before = await service.getSession(sessionId);
          expect(before.status).toBe("active");

          const paused = await service.pauseSession(sessionId);
          const resumed = await service.resumeSession(sessionId);
          totalCycles++;
          totalPendingSeen += before.pendingEvents.length;
          if (JSON.stringify(before.state.metrics) !== JSON.stringify(handle.state.metrics)) {
            totalMetricChanges++;
          }

          expect(paused.status).toBe("paused");
          expect(resumed.status).toBe("active");

          // Boundary values are identical at pause and at resume.
          expect(boundary(paused)).toEqual(boundary(before));
          expect(boundary(resumed)).toEqual(boundary(before));

          // Pre-pause journal is unchanged and in order; exactly pause+resume appended.
          expect(resumed.events.slice(0, before.events.length)).toEqual(before.events);
          expect(resumed.events).toHaveLength(before.events.length + 2);
          expect(paused.events).toHaveLength(before.events.length + 1);
          const [pauseEvent, resumeEvent] = resumed.events.slice(before.events.length);
          expect(pauseEvent?.eventType).toBe("pause");
          expect(resumeEvent?.eventType).toBe("resume");
          expect(pauseEvent?.simTime).toBe(before.simTimeElapsed);
          expect(resumeEvent?.simTime).toBe(before.simTimeElapsed);
          expect(resumed.events.map((event) => event.sequencePos)).toEqual(
            resumed.events.map((_, position) => position),
          );
          expect(resumed.events.filter((e) => e.eventType === "pause")).toHaveLength(
            totalCyclesForSession(resumed),
          );
        }
      }),
      { numRuns: 100 },
    );

    // Non-vacuity: generated runs exercised pending events and state changes.
    expect(totalCycles).toBeGreaterThanOrEqual(100);
    expect(totalPendingSeen).toBeGreaterThan(0);
    expect(totalMetricChanges).toBeGreaterThan(0);
  }, 30000);
});

function totalCyclesForSession(session: SessionState): number {
  return session.events.filter((event) => event.eventType === "resume").length;
}
