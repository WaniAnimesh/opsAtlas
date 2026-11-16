import * as fc from "fast-check";

import { applyTransition } from "./engine.js";
import type { ScenarioAction, ScenarioDefinition, ScenarioState } from "../../types/index.js";

const stateArbitrary: fc.Arbitrary<ScenarioState> = fc
  .record({
    id: fc.nat({ max: 100_000 }),
    is_terminal: fc.boolean(),
    service_health: fc.constant({ api: "healthy" }),
    metrics: fc.record({ request_rate: fc.integer() }),
    dependencies: fc.constant({ database: "available" }),
    customer_impact: fc.string({ maxLength: 40 }),
    evidence_available: fc.array(fc.string({ maxLength: 20 }), { maxLength: 3 }),
    active_alerts: fc.array(fc.string({ maxLength: 20 }), { maxLength: 3 }),
  })
  .map(({ id, ...state }) => ({ id: `state-${id}`, ...state }));

const actionArbitrary: fc.Arbitrary<ScenarioAction> = fc
  .record({
    id: fc.nat({ max: 100_000 }),
    label: fc.string({ maxLength: 40 }),
    time_cost: fc.integer({ min: 1, max: 10_000 }),
    reversible: fc.boolean(),
    rationale_options: fc.array(fc.string({ maxLength: 40 }), { minLength: 1, maxLength: 3 }),
  })
  .map(({ id, ...action }) => ({
    id: `action-${id}`,
    preconditions: [],
    effects: [],
    side_effects: [],
    delayed_effects: [],
    ...action,
  }));

const scenarioCaseArbitrary = fc.record({
  state: stateArbitrary,
  targetState: stateArbitrary,
  action: actionArbitrary,
  hasApplicableTransition: fc.boolean(),
});

// Feature: opsatlas-platform, Property 5: Simulated Time Advancement
describe("Property 5: Simulated Time Advancement", () => {
  it("returns exactly the action time cost for successful transitions", () => {
    fc.assert(
      fc.property(
        scenarioCaseArbitrary,
        ({ state, targetState, action, hasApplicableTransition }) => {
          const nextState = { ...targetState, id: `target-${targetState.id}` };
          const definition: ScenarioDefinition = {
            initial_state_id: state.id,
            states: {
              [state.id]: state,
              [nextState.id]: nextState,
            },
            actions: { [action.id]: action },
            transitions: hasApplicableTransition
              ? [
                  {
                    from_state_id: state.id,
                    trigger: action.id,
                    guard: null,
                    to_state_id: nextState.id,
                    effects: [],
                    delayed_effects: [],
                  },
                ]
              : [],
            evidence: {},
          };

          const result = applyTransition(state, action, definition);

          if ("error" in result) {
            throw new Error(
              `Expected a successful transition, received ${result.error.body.error.code}`,
            );
          }

          expect(result.simTimeDelta).toBe(action.time_cost);
        },
      ),
      { numRuns: 100 },
    );
  });
});
