import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ScenarioContentFile } from "../../types/index.js";
import {
  InMemorySimulationRuntimeRepository,
  SimulationRuntimeService,
} from "../simulation-runtime/index.js";
import {
  InMemoryAssessmentRepository,
  InMemoryRubricRepository,
  ScoringService,
  SCORE_DIMENSIONS,
  createDefaultRubric,
  scoreSession,
} from "./index.js";

// Requirement 10.2: six separately labelled dimensions, no composite score.
const scenarioTemplate = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "content/scenarios/scenario-kinesis-2021-v1@1.0.0.json"),
    "utf8",
  ),
) as ScenarioContentFile;

const ACTION_IDS = Object.keys(scenarioTemplate.definition.actions);
const EVIDENCE_IDS = Object.keys(scenarioTemplate.definition.evidence);
const RATIONALES = Object.values(scenarioTemplate.definition.actions).flatMap(
  (a) => a.rationale_options,
);

type Step = { kind: "action"; id: string; rationale: string } | { kind: "evidence"; id: string };

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  fc.record({
    kind: fc.constant("action" as const),
    id: fc.constantFrom(...ACTION_IDS),
    rationale: fc.oneof(fc.constantFrom(...RATIONALES), fc.string({ maxLength: 20 })),
  }),
  fc.record({ kind: fc.constant("evidence" as const), id: fc.constantFrom(...EVIDENCE_IDS) }),
);

const caseArb = fc.record({
  steps: fc.array(stepArb, { maxLength: 8 }),
  status: fc.constantFrom("completed", "abandoned", "timed_out"),
  startOverloaded: fc.boolean(),
});

const FORBIDDEN_KEY = /composite|total|overall|aggregate|average|sum/i;

function collectKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      collectKeys(v, out);
    }
  }
  return out;
}

describe("Property 9: Score Dimension Independence", () => {
  // Feature: opsatlas-platform, Property 9: Score Dimension Independence
  // **Validates: Requirements 10.2**
  it("exposes six separately labelled bounded dimensions and no composite", async () => {
    let nonEmptyRuns = 0;
    const statuses = new Set<string>();
    await fc.assert(
      fc.asyncProperty(caseArb, async ({ steps, status, startOverloaded }) => {
        const scenario = structuredClone(scenarioTemplate);
        if (startOverloaded) scenario.definition.initial_state_id = "state-kinesis-overloaded";
        const repository = new InMemorySimulationRuntimeRepository();
        const runtime = new SimulationRuntimeService({
          repository,
          scenarioSource: {
            getById: async () => structuredClone(scenario),
            getVersion: async () => structuredClone(scenario),
          },
        });
        const assessments = new InMemoryAssessmentRepository();
        const scoring = new ScoringService({
          sessions: repository,
          rubrics: new InMemoryRubricRepository(),
          assessments,
        });
        const { sessionId } = await runtime.createSession(scenario.id);
        for (const step of steps) {
          try {
            if (step.kind === "action")
              await runtime.applyAction(sessionId, step.id, step.rationale);
            else await runtime.requestEvidence(sessionId, step.id);
          } catch {
            // Rejected steps (preconditions, terminal state) leave the journal unchanged.
          }
        }
        const session = await repository.getSession(sessionId);
        if (session === null) throw new Error("missing session");
        await repository.updateSession({ ...session, status });

        const debrief = await scoring.computeDebrief(sessionId);
        const assessment = await assessments.getBySessionId(sessionId);
        expect(assessment).not.toBeNull();

        if ((await repository.listEvents(sessionId)).length > 1) nonEmptyRuns++;
        statuses.add(status);

        const dimensionKeys = [...SCORE_DIMENSIONS].sort();
        expect(Object.keys(debrief.scores).sort()).toEqual(dimensionKeys);
        expect(Object.keys(debrief.labels).sort()).toEqual(dimensionKeys);
        for (const key of SCORE_DIMENSIONS) {
          expect(assessment).toHaveProperty(key);
          for (const value of [debrief.scores[key], (assessment as never)[key] as number]) {
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(debrief.maxScore);
            expect(Math.round(value * 100) / 100).toBe(value);
          }
          expect(debrief.scores[key]).toBe((assessment as never)[key]);
        }
        for (const k of [...collectKeys(debrief), ...collectKeys(assessment)]) {
          expect(k).not.toMatch(FORBIDDEN_KEY);
        }
      }),
      { numRuns: 100 },
    );
    expect(nonEmptyRuns).toBeGreaterThan(10);
    expect(statuses.size).toBe(3);
  }, 30000);

  // Feature: opsatlas-platform, Property 9: Score Dimension Independence
  // **Validates: Requirements 10.2**
  it("changing one dimension's inputs leaves unrelated dimensions unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(caseArb, fc.integer({ min: 0, max: 60 }), async ({ steps }, elapsed) => {
        const scenario = structuredClone(scenarioTemplate);
        scenario.definition.initial_state_id = "state-kinesis-overloaded";
        const repository = new InMemorySimulationRuntimeRepository();
        const runtime = new SimulationRuntimeService({
          repository,
          scenarioSource: {
            getById: async () => structuredClone(scenario),
            getVersion: async () => structuredClone(scenario),
          },
        });
        const { sessionId } = await runtime.createSession(scenario.id);
        for (const step of steps) {
          try {
            if (step.kind === "action")
              await runtime.applyAction(sessionId, step.id, step.rationale);
            else await runtime.requestEvidence(sessionId, step.id);
          } catch {
            // ignored
          }
        }
        const session = await repository.getSession(sessionId);
        if (session === null) throw new Error("missing session");
        const concluded = { ...session, status: "completed" as const };
        const events = await repository.listEvents(sessionId);
        const rubric = createDefaultRubric();
        const base = scoreSession(concluded, scenario, events, rubric).scores;

        const others = (changed: string): string[] => SCORE_DIMENSIONS.filter((d) => d !== changed);
        const expectOnlyChanged = (next: Record<string, number>, changed: string): void => {
          for (const d of others(changed)) expect(next[d]).toBe(base[d as keyof typeof base]);
        };

        // Time elapsed only drives Impact Control.
        expectOnlyChanged(
          scoreSession({ ...concluded, simTimeElapsed: elapsed }, scenario, events, rubric).scores,
          "impactControl",
        );
        // Communication keywords only drive Communication.
        const noKeywords = structuredClone(rubric);
        noKeywords.criteria.communication.actionKeywords = [];
        expectOnlyChanged(
          scoreSession(concluded, scenario, events, noKeywords).scores,
          "communication",
        );
        // Terminal mapping only drives Recovery Quality.
        const zeroRecovery = structuredClone(rubric);
        zeroRecovery.criteria.recoveryQuality.unmappedTerminalFraction = 0;
        zeroRecovery.terminalStates["state-mitigated"] = {
          outcome: "x",
          recoveryFraction: 0,
          debrief: "x",
        };
        expectOnlyChanged(
          scoreSession(concluded, scenario, events, zeroRecovery).scores,
          "recoveryQuality",
        );
      }),
      { numRuns: 100 },
    );
  }, 30000);
});
