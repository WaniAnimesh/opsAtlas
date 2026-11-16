import * as fc from "fast-check";

import { applyTransition, type TransitionResult } from "./engine.js";
import type { ScenarioDefinition, ScenarioState } from "../../types/index.js";

interface ReplayResult {
  results: TransitionResult[];
  stateIds: string[];
  finalState: ScenarioState;
}

const scenarioArbitrary: fc.Arbitrary<ScenarioDefinition> = fc
  .record({
    initialLatency: fc.integer({ min: 1, max: 1_000 }),
    stableLatency: fc.integer({ min: 1, max: 1_000 }),
    actionLatency: fc.integer({ min: 1, max: 1_000 }),
    actionAttempts: fc.integer({ min: 0, max: 100 }),
    actionTimeCost: fc.nat({ max: 30 }),
    actionDelay: fc.nat({ max: 30 }),
    transitionDelay: fc.nat({ max: 30 }),
  })
  .map(
    ({
      initialLatency,
      stableLatency,
      actionLatency,
      actionAttempts,
      actionTimeCost,
      actionDelay,
      transitionDelay,
    }): ScenarioDefinition => ({
      initial_state_id: "initial",
      states: {
        initial: createState("initial", initialLatency, 0),
        stable: createState("stable", stableLatency, 1),
      },
      actions: {
        advance: {
          id: "advance",
          label: "Advance scenario",
          preconditions: [],
          time_cost: actionTimeCost,
          effects: [
            { field: "metrics.latency", value: actionLatency },
            { field: "customer_impact", value: "degraded" },
          ],
          side_effects: [
            { field: "metrics.attempts", value: actionAttempts },
            { field: "service_health.api", value: "recovering" },
          ],
          delayed_effects: [
            {
              delay: actionDelay,
              effect: { field: "metrics.delayed", value: "action-effect" },
            },
          ],
          reversible: false,
          rationale_options: ["Generated test rationale"],
        },
        settle: {
          id: "settle",
          label: "Settle scenario",
          preconditions: [],
          time_cost: 0,
          effects: [{ field: "customer_impact", value: "resolved" }],
          side_effects: [{ field: "service_health.api", value: "healthy" }],
          delayed_effects: [],
          reversible: true,
          rationale_options: ["Generated test rationale"],
        },
      },
      transitions: [
        {
          from_state_id: "initial",
          trigger: "advance",
          guard: null,
          to_state_id: "stable",
          effects: [{ field: "metrics.latency", value: stableLatency }],
          delayed_effects: [
            {
              delay: transitionDelay,
              effect: { field: "metrics.delayed", value: "transition-effect" },
            },
          ],
        },
        {
          from_state_id: "stable",
          trigger: "settle",
          guard: null,
          to_state_id: "stable",
          effects: [],
          delayed_effects: [],
        },
      ],
      evidence: {},
    }),
  );

const actionSequenceArbitrary = fc
  .tuple(fc.constant("advance"), fc.array(fc.constantFrom("advance", "settle"), { maxLength: 8 }))
  .map(([firstAction, remainingActions]) => [firstAction, ...remainingActions]);

function createState(id: string, latency: number, attempts: number): ScenarioState {
  return {
    id,
    is_terminal: false,
    service_health: { api: "degraded" },
    metrics: { latency, attempts },
    dependencies: { database: "available" },
    customer_impact: "elevated",
    evidence_available: [],
    active_alerts: ["latency-high"],
  };
}

function replay(
  initialState: ScenarioState,
  actionIds: readonly string[],
  definition: ScenarioDefinition,
): ReplayResult {
  let state = initialState;
  const results: TransitionResult[] = [];
  const stateIds = [state.id];

  for (const actionId of actionIds) {
    const action = definition.actions[actionId];
    if (action === undefined) {
      throw new Error(`Generated action ${actionId} is not defined`);
    }

    const result = applyTransition(state, action, definition);
    results.push(result);
    if ("nextState" in result) {
      state = result.nextState;
    }
    stateIds.push(state.id);
  }

  return { results, stateIds, finalState: state };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("applyTransition deterministic replay", () => {
  // Feature: opsatlas-platform, Property 1: Deterministic Scenario Replay
  it("replays generated scenarios with identical observable results and ordering", () => {
    fc.assert(
      fc.property(scenarioArbitrary, actionSequenceArbitrary, (definition, actionIds) => {
        const initialState = definition.states[definition.initial_state_id];
        if (initialState === undefined) {
          throw new Error("Generated definition has no initial state");
        }

        const initialStateBefore = clone(initialState);
        const definitionBefore = clone(definition);
        const actionsBefore = clone(actionIds);

        const firstReplay = replay(initialState, actionIds, definition);
        const secondReplay = replay(initialState, actionIds, definition);

        expect(firstReplay).toEqual(secondReplay);
        expect(firstReplay.stateIds[0]).toBe(definition.initial_state_id);
        expect(firstReplay.results).toHaveLength(actionIds.length);

        expect(initialState).toEqual(initialStateBefore);
        expect(definition).toEqual(definitionBefore);
        expect(actionIds).toEqual(actionsBefore);
      }),
      { numRuns: 100 },
    );
  });
});
