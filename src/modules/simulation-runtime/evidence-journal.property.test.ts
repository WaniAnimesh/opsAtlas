import * as fc from "fast-check";

import type { EvidenceItem, ScenarioContentFile, ScenarioState } from "../../types/index.js";
import {
  InMemorySimulationRuntimeRepository,
  SimulationRuntimeService,
  type SessionEvent,
  type ScenarioVersionSource,
} from "./index.js";

type EvidenceDefinition = Omit<EvidenceItem, "id">;

type EvidencePropertyModel = {
  entries: EvidenceDefinition[];
  serviceHealth: Record<string, string>;
  metrics: Record<string, number>;
  dependencies: Record<string, string>;
  customerImpact: string;
  activeAlerts: string[];
  requestIndexes: number[];
};

const evidenceDefinitionArbitrary: fc.Arbitrary<EvidenceDefinition> = fc.record({
  category: fc.constantFrom<EvidenceItem["category"]>("Observable", "Indicator", "Artifact"),
  type: fc.constantFrom<EvidenceItem["type"]>("logs", "metrics", "topology", "change_history"),
  time_cost: fc.nat({ max: 20 }),
  payload: fc.jsonValue(),
});

const stateFieldArbitrary = fc.record({
  serviceHealth: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 8 }),
    fc.constantFrom("healthy", "degraded", "down"),
    { maxKeys: 3 },
  ),
  metrics: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 8 }),
    fc.integer({ min: -100, max: 100 }),
    { maxKeys: 3 },
  ),
  dependencies: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 8 }),
    fc.constantFrom("available", "degraded", "unavailable"),
    { maxKeys: 3 },
  ),
  customerImpact: fc.string({ maxLength: 30 }),
  activeAlerts: fc.array(fc.string({ maxLength: 12 }), { maxLength: 3 }),
});

const evidencePropertyModelArbitrary: fc.Arbitrary<EvidencePropertyModel> = fc
  .record({
    entries: fc.array(evidenceDefinitionArbitrary, { minLength: 2, maxLength: 5 }),
    stateFields: stateFieldArbitrary,
    requestIndexes: fc.array(fc.integer({ min: -3, max: 12 }), {
      minLength: 1,
      maxLength: 8,
    }),
  })
  .map(({ entries, stateFields, requestIndexes }) => ({
    entries,
    ...stateFields,
    requestIndexes,
  }));

function buildScenario(model: EvidencePropertyModel): ScenarioContentFile {
  const evidence = Object.fromEntries(
    model.entries.map((entry, index) => [
      `evidence-${index}`,
      { ...entry, id: `evidence-${index}` },
    ]),
  );
  const initialState: ScenarioState = {
    id: "initial",
    is_terminal: false,
    service_health: model.serviceHealth,
    metrics: model.metrics,
    dependencies: model.dependencies,
    customer_impact: model.customerImpact,
    // The first generated evidence item is available; the second is defined
    // but unavailable. This guarantees both defined-status branches per run.
    evidence_available: ["evidence-0"],
    active_alerts: model.activeAlerts,
  };

  return {
    id: "property-evidence-scenario",
    incident_slug: "property-evidence-incident",
    title: "Evidence journal property scenario",
    objective: "Verify evidence requests are journaled.",
    difficulty: "beginner",
    est_duration_min: 5,
    rubric_version: "rubric-property-1",
    skill_tags: ["observability"],
    version: "1.0.0",
    definition: {
      initial_state_id: initialState.id,
      states: { [initialState.id]: initialState },
      actions: {},
      transitions: [],
      evidence,
    },
  };
}

function requestedEvidenceId(index: number, entryCount: number): string {
  return index >= 0 && index < entryCount ? `evidence-${index}` : `missing-${Math.abs(index)}`;
}

function expectedEvidenceStatus(
  scenario: ScenarioContentFile,
  state: ScenarioState,
  evidenceId: string,
): "available" | "unavailable" {
  const evidence = scenario.definition.evidence[evidenceId];
  return evidence !== undefined && state.evidence_available.includes(evidenceId)
    ? "available"
    : "unavailable";
}

function assertEvidenceJournalEvent(
  event: SessionEvent | undefined,
  expected: {
    sessionId: string;
    sequencePos: number;
    evidenceId: string;
    evidence: EvidenceItem | undefined;
    status: "available" | "unavailable";
    simTime: number;
    state: ScenarioState;
    simTimeAfter: number;
  },
): void {
  expect(event).toBeDefined();
  expect(event).toMatchObject({
    sessionId: expected.sessionId,
    sequencePos: expected.sequencePos,
    simTime: expected.simTime,
    eventType: "evidence_request",
    stateSnapshot: expected.state,
    payload: {
      evidenceId: expected.evidenceId,
      evidenceType: expected.evidence?.type ?? null,
      evidenceCategory: expected.evidence?.category ?? null,
      status: expected.status,
      simTimeBefore: expected.simTime,
      simTimeAfter: expected.simTimeAfter,
      stateSnapshot: expected.state,
      decisionJournal: {
        evidenceId: expected.evidenceId,
        evidenceType: expected.evidence?.type ?? null,
        evidenceCategory: expected.evidence?.category ?? null,
        status: expected.status,
        simTime: expected.simTime,
        stateSnapshot: expected.state,
      },
    },
  });
}

describe("SimulationRuntimeService evidence journal recording", () => {
  // Feature: opsatlas-platform, Property 4: Evidence Journal Recording
  it("records one ordered journal event with request context for every active-session evidence request", async () => {
    await fc.assert(
      fc.asyncProperty(evidencePropertyModelArbitrary, async (model) => {
        const scenario = buildScenario(model);
        const source: ScenarioVersionSource = {
          getById: async (scenarioId) => (scenarioId === scenario.id ? scenario : null),
          getVersion: async (scenarioId, v) =>
            scenarioId === scenario.id && v === scenario.version ? scenario : null,
        };
        const repository = new InMemorySimulationRuntimeRepository();
        let generatedId = 0;
        const service = new SimulationRuntimeService({
          repository,
          scenarioSource: source,
          idGenerator: () => `generated-${generatedId++}`,
          clock: () => new Date("2025-01-02T03:04:05.000Z"),
        });
        const handle = await service.createSession(scenario.id);
        const initialSession = await service.getSession(handle.sessionId);
        const requestIds = [
          "evidence-0",
          "evidence-1",
          "missing-evidence",
          ...model.requestIndexes.map((index) => requestedEvidenceId(index, model.entries.length)),
        ];
        let expectedSimTime = initialSession.simTimeElapsed;

        for (const [requestIndex, evidenceId] of requestIds.entries()) {
          const beforeSession = await service.getSession(handle.sessionId);
          const beforeEvents = await repository.listEvents(handle.sessionId);
          expect(beforeSession.status).toBe("active");

          const evidence = scenario.definition.evidence[evidenceId];
          const status = expectedEvidenceStatus(scenario, beforeSession.state, evidenceId);
          const timeCost =
            status === "available" && evidence !== undefined ? evidence.time_cost : 0;
          expectedSimTime += timeCost;

          const result = await service.requestEvidence(handle.sessionId, evidenceId);
          const afterEvents = await repository.listEvents(handle.sessionId);

          expect(afterEvents).toHaveLength(beforeEvents.length + 1);
          expect(
            afterEvents.filter((event) => event.eventType === "evidence_request"),
          ).toHaveLength(requestIndex + 1);
          expect(afterEvents.map((event) => event.sequencePos)).toEqual(
            afterEvents.map((_, sequenceIndex) => sequenceIndex),
          );
          expect(result.status).toBe(status);
          expect(result.simTime).toBe(beforeSession.simTimeElapsed);
          expect(result.simTimeElapsed).toBe(expectedSimTime);

          assertEvidenceJournalEvent(afterEvents[afterEvents.length - 1], {
            sessionId: handle.sessionId,
            sequencePos: beforeEvents.length,
            evidenceId,
            evidence,
            status,
            simTime: beforeSession.simTimeElapsed,
            state: beforeSession.state,
            simTimeAfter: expectedSimTime,
          });
        }
      }),
      { numRuns: 100 },
    );
  }, 30000);
});
