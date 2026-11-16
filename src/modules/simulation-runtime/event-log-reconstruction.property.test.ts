import * as fc from "fast-check";

import type {
  ScenarioAction,
  ScenarioContentFile,
  ScenarioDefinition,
  ScenarioState,
} from "../../types/index.js";
import { applyTransition } from "./engine.js";
import {
  InMemorySimulationRuntimeRepository,
  SimulationRuntimeService,
  type SessionEvent,
  type SessionEventType,
} from "./index.js";

type ActionOperation = {
  kind: "action";
  actionId: "action-a" | "action-b";
};

type BoundaryOperation = {
  kind: "boundary";
  eventType: Exclude<SessionEventType, "initial_state" | "action">;
};

type SessionOperation = ActionOperation | BoundaryOperation;

const sessionOperationArbitrary: fc.Arbitrary<SessionOperation> = fc.oneof(
  fc
    .constantFrom<ActionOperation["actionId"]>("action-a", "action-b")
    .map((actionId): ActionOperation => ({
      kind: "action",
      actionId,
    })),
  fc
    .constantFrom<BoundaryOperation["eventType"]>(
      "evidence_request",
      "pause",
      "resume",
      "abandon",
      "timeout",
    )
    .map((eventType): BoundaryOperation => ({ kind: "boundary", eventType })),
);

const sessionOperationsArbitrary = fc.array(sessionOperationArbitrary, {
  minLength: 1,
  maxLength: 16,
});

const scenarioArbitrary: fc.Arbitrary<ScenarioContentFile> = fc
  .record({
    initialLatency: fc.integer({ min: 1, max: 1_000 }),
    stableLatency: fc.integer({ min: 1, max: 1_000 }),
    actionALatency: fc.integer({ min: 1, max: 1_000 }),
    actionBLatency: fc.integer({ min: 1, max: 1_000 }),
    actionATimeCost: fc.nat({ max: 30 }),
    actionBTimeCost: fc.nat({ max: 30 }),
  })
  .map(
    ({
      initialLatency,
      stableLatency,
      actionALatency,
      actionBLatency,
      actionATimeCost,
      actionBTimeCost,
    }): ScenarioContentFile => ({
      id: "generated-session-replay-scenario",
      incident_slug: "generated-session-replay-incident",
      title: "Generated session replay scenario",
      objective: "Verify event log reconstruction.",
      difficulty: "beginner",
      est_duration_min: 5,
      rubric_version: "rubric-1",
      skill_tags: ["replay"],
      version: "1.0.0",
      definition: createDefinition(
        initialLatency,
        stableLatency,
        actionALatency,
        actionBLatency,
        actionATimeCost,
        actionBTimeCost,
      ),
    }),
  );

function createDefinition(
  initialLatency: number,
  stableLatency: number,
  actionALatency: number,
  actionBLatency: number,
  actionATimeCost: number,
  actionBTimeCost: number,
): ScenarioDefinition {
  return {
    initial_state_id: "initial",
    states: {
      initial: createState("initial", initialLatency, "elevated"),
      stable: createState("stable", stableLatency, "none"),
    },
    actions: {
      "action-a": createAction("action-a", actionALatency, actionATimeCost),
      "action-b": createAction("action-b", actionBLatency, actionBTimeCost),
    },
    transitions: [
      createTransition("initial", "action-a", "stable"),
      createTransition("stable", "action-a", "initial"),
      createTransition("initial", "action-b", "initial"),
      createTransition("stable", "action-b", "stable"),
    ],
    evidence: {
      "evidence-1": {
        id: "evidence-1",
        category: "Observable",
        type: "logs",
        time_cost: 0,
        payload: { message: "generated evidence" },
      },
    },
  };
}

function createState(id: string, latency: number, customerImpact: string): ScenarioState {
  return {
    id,
    is_terminal: false,
    service_health: { api: id === "stable" ? "healthy" : "degraded" },
    metrics: { latency },
    dependencies: { database: "available" },
    customer_impact: customerImpact,
    evidence_available: ["evidence-1"],
    active_alerts: id === "stable" ? [] : ["latency-high"],
  };
}

function createAction(id: string, latency: number, timeCost: number): ScenarioAction {
  return {
    id,
    label: `Generated ${id}`,
    preconditions: [],
    time_cost: timeCost,
    effects: [{ field: "metrics.latency", value: latency }],
    side_effects: [],
    delayed_effects: [],
    reversible: true,
    rationale_options: ["Generated rationale"],
  };
}

function createTransition(
  fromStateId: string,
  actionId: string,
  toStateId: string,
): ScenarioDefinition["transitions"][number] {
  return {
    from_state_id: fromStateId,
    trigger: actionId,
    guard: null,
    to_state_id: toStateId,
    effects: [],
    delayed_effects: [],
  };
}

function observableState(state: ScenarioState): ScenarioState {
  return {
    id: state.id,
    is_terminal: state.is_terminal,
    service_health: structuredClone(state.service_health),
    metrics: structuredClone(state.metrics),
    dependencies: structuredClone(state.dependencies),
    customer_impact: state.customer_impact,
    evidence_available: [...state.evidence_available],
    active_alerts: [...state.active_alerts],
  };
}

describe("SimulationRuntimeService event log reconstruction", () => {
  // Feature: opsatlas-platform, Property 2: Session Event Log Completeness
  it("reconstructs the final observable state from ordered action and boundary events", async () => {
    await fc.assert(
      fc.asyncProperty(
        scenarioArbitrary,
        sessionOperationsArbitrary,
        async (scenario, operations) => {
          const repository = new InMemorySimulationRuntimeRepository();
          let generatedId = 0;
          const service = new SimulationRuntimeService({
            repository,
            scenarioSource: {
              getById: async (scenarioId) => (scenarioId === scenario.id ? scenario : null),
              getVersion: async (scenarioId, v) =>
                scenarioId === scenario.id && v === scenario.version ? scenario : null,
            },
            idGenerator: () => `generated-id-${generatedId++}`,
            clock: () => new Date("2025-01-02T03:04:05.000Z"),
          });

          const handle = await service.createSession(scenario.id);
          let currentState = structuredClone(handle.state);
          let simulatedTime = 0;
          const generatedEvents: SessionEvent[] = [];

          for (const [index, operation] of operations.entries()) {
            const sequencePos = index + 1;
            const eventType: SessionEventType =
              operation.kind === "action" ? "action" : operation.eventType;
            let payload: Record<string, unknown>;

            if (operation.kind === "action") {
              const action = scenario.definition.actions[operation.actionId];
              if (action === undefined) {
                throw new Error(`Generated action ${operation.actionId} is not defined`);
              }

              const result = applyTransition(currentState, action, scenario.definition);
              if (!("nextState" in result)) {
                throw new Error("Generated action was not applicable to the generated state");
              }

              currentState = result.nextState;
              simulatedTime += result.simTimeDelta;
              payload = { actionId: operation.actionId, rationale: "Generated rationale" };
            } else {
              payload =
                operation.eventType === "evidence_request"
                  ? { evidenceId: "evidence-1", evidenceType: "logs" }
                  : { lifecycle: operation.eventType };
            }

            generatedEvents.push({
              id: `event-${sequencePos}`,
              sessionId: handle.sessionId,
              sequencePos,
              simTime: simulatedTime,
              eventType,
              payload,
              stateSnapshot: structuredClone(currentState),
              wallTime: new Date(2025, 0, 2, 3, 4, 5 + sequencePos).toISOString(),
            });
          }

          const session = await repository.getSession(handle.sessionId);
          if (session === null) {
            throw new Error("Created session was not persisted");
          }
          await repository.updateSession({
            ...session,
            status: "abandoned",
            endedAt: "2025-01-02T03:04:30.000Z",
            simTimeElapsed: simulatedTime,
          });

          // Persist out of order so the assertion exercises repository ordering,
          // rather than relying on the generation order of the event array.
          for (const event of [...generatedEvents].reverse()) {
            await repository.appendEvent(event);
          }

          const reconstructed = await service.getSession(handle.sessionId);
          const orderedEvents = await repository.listEvents(handle.sessionId);
          const finalRecordedState = orderedEvents.at(-1)?.stateSnapshot;

          expect(orderedEvents.map((event) => event.sequencePos)).toEqual(
            Array.from({ length: generatedEvents.length + 1 }, (_, index) => index),
          );
          expect(finalRecordedState).toBeDefined();
          expect(observableState(reconstructed.state)).toEqual(
            observableState(finalRecordedState!),
          );
          expect(observableState(reconstructed.state)).toEqual(observableState(currentState));
          expect(reconstructed.status).toBe("abandoned");
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
