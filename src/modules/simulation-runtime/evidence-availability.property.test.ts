import * as fc from "fast-check";

import { resolveEvidence } from "./engine.js";
import type { EvidenceItem, ScenarioDefinition, ScenarioState } from "../../types/index.js";

const evidenceId = "evidence-target";

const stateArbitrary: fc.Arbitrary<ScenarioState> = fc
  .record({
    stateId: fc.string({ minLength: 1, maxLength: 24 }),
    otherEvidenceIds: fc
      .array(fc.string({ minLength: 1, maxLength: 24 }), { maxLength: 4 })
      .map((ids) => ids.filter((id) => id !== evidenceId)),
    isTerminal: fc.boolean(),
    customerImpact: fc.string({ maxLength: 40 }),
  })
  .map(({ stateId, otherEvidenceIds, isTerminal, customerImpact }) => ({
    id: stateId,
    is_terminal: isTerminal,
    service_health: { service: "healthy" },
    metrics: { request_rate: 1 },
    dependencies: { database: "available" },
    customer_impact: customerImpact,
    evidence_available: otherEvidenceIds,
    active_alerts: [],
  }));

const evidenceItemArbitrary: fc.Arbitrary<EvidenceItem> = fc
  .record({
    category: fc.constantFrom("Observable", "Indicator", "Artifact"),
    type: fc.constantFrom("logs", "metrics", "topology", "change_history"),
    time_cost: fc.nat({ max: 30 }),
    payload: fc.oneof(
      fc.string({ maxLength: 40 }),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.array(fc.string({ maxLength: 16 }), { maxLength: 3 }),
    ),
  })
  .map((item) => ({ ...item, id: evidenceId }));

type EvidenceAvailabilityCase = {
  includeDefinition: boolean;
  includeInState: boolean;
};

const availabilityCaseArbitrary: fc.Arbitrary<EvidenceAvailabilityCase> = fc.constantFrom(
  { includeDefinition: true, includeInState: true },
  { includeDefinition: true, includeInState: false },
  { includeDefinition: false, includeInState: true },
  { includeDefinition: false, includeInState: false },
);

function definitionFor(
  state: ScenarioState,
  evidence: EvidenceItem,
  includeDefinition: boolean,
): ScenarioDefinition {
  return {
    initial_state_id: state.id,
    states: { [state.id]: state },
    actions: {},
    transitions: [],
    evidence: includeDefinition ? { [evidence.id]: evidence } : {},
  };
}

// Feature: opsatlas-platform, Property 3: Evidence Availability Consistency
describe("Evidence availability consistency", () => {
  it("returns available evidence only when it is defined and listed by the current state", () => {
    fc.assert(
      fc.property(
        stateArbitrary,
        evidenceItemArbitrary,
        availabilityCaseArbitrary,
        (state, evidence, availabilityCase) => {
          const currentState = {
            ...state,
            evidence_available: [
              ...state.evidence_available,
              ...(availabilityCase.includeInState ? [evidenceId] : []),
            ],
          };
          const definition = definitionFor(
            currentState,
            evidence,
            availabilityCase.includeDefinition,
          );
          const result = resolveEvidence(currentState, evidenceId, definition);
          const shouldBeAvailable =
            availabilityCase.includeDefinition && availabilityCase.includeInState;

          if (shouldBeAvailable) {
            expect(result.status).not.toBe("unavailable");
            expect(result.payload).toEqual(evidence.payload);
          } else {
            expect(result).toEqual({ status: "unavailable" });
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
