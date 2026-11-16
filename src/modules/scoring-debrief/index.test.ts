import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ScenarioContentFile } from "../../types/index.js";
import {
  InMemorySimulationRuntimeRepository,
  SimulationRuntimeService,
} from "../simulation-runtime/index.js";
import {
  InMemoryAssessmentRepository,
  InMemoryRubricRepository,
  ScoringError,
  ScoringService,
  SCORE_DIMENSIONS,
} from "./index.js";

function loadScenario(rubricVersion = "1.0.0"): ScenarioContentFile {
  const scenario = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "content/scenarios/scenario-kinesis-2021-v1@1.0.0.json"),
      "utf8",
    ),
  ) as ScenarioContentFile;
  scenario.definition.initial_state_id = "state-kinesis-overloaded";
  scenario.rubric_version = rubricVersion;
  return scenario;
}

async function setup(rubrics = new InMemoryRubricRepository(), rubricVersion = "1.0.0") {
  const repository = new InMemorySimulationRuntimeRepository();
  const scenario = loadScenario(rubricVersion);
  const runtime = new SimulationRuntimeService({
    repository,
    scenarioSource: {
      getById: async () => structuredClone(scenario),
      getVersion: async () => structuredClone(scenario),
    },
  });
  const assessments = new InMemoryAssessmentRepository();
  const scoring = new ScoringService({ sessions: repository, rubrics, assessments });
  const handle = await runtime.createSession(scenario.id);
  const conclude = async (status: "completed" | "timed_out" | "abandoned") => {
    const session = await repository.getSession(handle.sessionId);
    if (session === null) throw new Error("missing session");
    await repository.updateSession({ ...session, status });
  };
  return { runtime, scoring, assessments, handle, conclude };
}

describe("ScoringService.computeDebrief", () => {
  it("scores six labelled dimensions, links the incident, and has no composite field", async () => {
    const { runtime, scoring, handle, conclude } = await setup();
    const id = handle.sessionId;
    await runtime.requestEvidence(id, "ev-kinesis-metrics");
    await runtime.applyAction(
      id,
      "action-declare-incident",
      "Customer impact exceeds SEV1 thresholds; team needs to coordinate",
    );
    await runtime.applyAction(
      id,
      "action-scale-kinesis",
      "Kinesis metrics show thread-limit exhaustion; scaling will restore capacity",
    );
    await conclude("completed");

    const debrief = await scoring.computeDebrief(id);

    expect(Object.keys(debrief.scores).sort()).toEqual([...SCORE_DIMENSIONS].sort());
    for (const key of SCORE_DIMENSIONS) {
      expect(debrief.scores[key]).toBeGreaterThanOrEqual(0);
      expect(debrief.scores[key]).toBeLessThanOrEqual(debrief.maxScore);
      expect(debrief.labels[key]).toBeTruthy();
    }
    expect(debrief.incidentSlug).toBe("aws-us-east-1-2021-kinesis");
    expect(debrief.scores.diagnosticQuality).toBe(10);
    expect(debrief.scores.riskManagement).toBe(10);
    expect(debrief.scores.communication).toBe(10);
    expect(debrief.scores.learningReflection).toBe(10);
    expect(JSON.stringify(debrief)).not.toMatch(/composite|total|overall|aggregate/i);
  });

  it("penalises an irreversible action taken without evidence", async () => {
    const { runtime, scoring, handle, conclude } = await setup();
    await runtime.applyAction(handle.sessionId, "action-scale-kinesis", "guess");
    await conclude("abandoned");
    const debrief = await scoring.computeDebrief(handle.sessionId);
    expect(debrief.scores.riskManagement).toBe(0);
    expect(debrief.scores.learningReflection).toBe(0);
  });

  it("persists one assessment and returns it on repeat calls", async () => {
    const { scoring, assessments, handle, conclude } = await setup();
    await conclude("timed_out");
    const first = await scoring.computeDebrief(handle.sessionId);
    const second = await scoring.computeDebrief(handle.sessionId);
    expect(second).toEqual(first);
    expect(first.scores.impactControl).toBe(0);
    expect(await assessments.getBySessionId(handle.sessionId)).not.toBeNull();
  });

  it("rejects active sessions with a structured error", async () => {
    const { scoring, handle } = await setup();
    await expect(scoring.computeDebrief(handle.sessionId)).rejects.toMatchObject({
      body: { error: { code: "SESSION_NOT_CONCLUDED" } },
    });
  });

  it("fails with RUBRIC_VERSION_UNAVAILABLE before scoring or persisting", async () => {
    const { scoring, assessments, handle, conclude } = await setup(
      new InMemoryRubricRepository([]),
    );
    await conclude("completed");
    const error = await scoring.computeDebrief(handle.sessionId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScoringError);
    expect((error as ScoringError).body.error.code).toBe("RUBRIC_VERSION_UNAVAILABLE");
    expect(await assessments.getBySessionId(handle.sessionId)).toBeNull();
  });

  it("returns SESSION_NOT_FOUND for unknown sessions", async () => {
    const { scoring, handle, conclude } = await setup();
    await conclude("completed");
    await expect(scoring.computeDebrief(`${handle.sessionId}-other`)).rejects.toMatchObject({
      body: { error: { code: "SESSION_NOT_FOUND" } },
    });
  });
});

describe("ScoringService.getReplayStep", () => {
  it("shows unrequested evidence and bounded alternatives for an action step", async () => {
    const { runtime, scoring, handle, conclude } = await setup();
    const id = handle.sessionId;
    await runtime.applyAction(id, "action-declare-incident", "coordinate");
    await runtime.requestEvidence(id, "ev-kinesis-metrics");
    await conclude("completed");

    const first = await scoring.getReplayStep(id, 0);
    expect(first.eventType).toBe("action");
    expect(first.step).toBe(0);
    expect(first.totalSteps).toBe(2);
    expect(first.revealedEvidence).toEqual([]);
    expect(first.unrequestedEvidence.map((e) => e.evidenceId)).toContain("ev-kinesis-metrics");
    expect(first.alternatives.length).toBeGreaterThan(0);
    for (const alt of first.alternatives) {
      expect(alt.description.length).toBeGreaterThan(0);
      expect(alt.description.length).toBeLessThanOrEqual(200);
    }

    const second = await scoring.getReplayStep(id, 1);
    expect(second.eventType).toBe("evidence_request");
    expect(second.evidenceId).toBe("ev-kinesis-metrics");
  });

  it("rejects out-of-range steps, unknown sessions and active sessions", async () => {
    const { runtime, scoring, handle, conclude } = await setup();
    await runtime.requestEvidence(handle.sessionId, "ev-kinesis-metrics");
    await expect(scoring.getReplayStep(handle.sessionId, 0)).rejects.toMatchObject({
      body: { error: { code: "SESSION_NOT_CONCLUDED" } },
    });
    await conclude("completed");
    await expect(scoring.getReplayStep(handle.sessionId, 5)).rejects.toMatchObject({
      body: { error: { code: "INVALID_INPUT" } },
    });
    await expect(scoring.getReplayStep("nope", 0)).rejects.toMatchObject({
      body: { error: { code: "SESSION_NOT_FOUND" } },
    });
  });
});
