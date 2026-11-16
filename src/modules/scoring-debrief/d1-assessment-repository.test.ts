import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { D1AssessmentRepository } from "./d1-assessment-repository.js";
import { InMemoryAssessmentRepository } from "./index.js";
import type { AssessmentRecord, AssessmentRepository } from "./index.js";
import { D1SimulationRuntimeRepository } from "../simulation-runtime/d1-repository.js";
import { createTestD1, type TestD1 } from "../../test-support/d1.js";
import {
  FIXTURE_SCENARIO,
  makeEvent,
  makeSession,
} from "../../test-support/repository-contract.js";

let d1: TestD1;

beforeAll(async () => {
  d1 = await createTestD1();
}, 60_000);

afterAll(async () => {
  await d1.dispose();
});

beforeEach(async () => {
  await d1.reset();
});

function record(sessionId: string, id: string, impactControl: number): AssessmentRecord {
  return {
    id,
    sessionId,
    rubricVersion: "1.0.0",
    impactControl,
    diagnosticQuality: 2.5,
    riskManagement: 3,
    recoveryQuality: 4,
    communication: 5,
    learningReflection: 6,
    feedback: {
      impactControl: "a",
      diagnosticQuality: "b",
      riskManagement: "c",
      recoveryQuality: "d",
      communication: "e",
      learningReflection: "f",
      terminalOutcome: "mitigated",
      terminalDebrief: "done",
    },
    computedAt: "2025-01-01T00:00:00.000Z",
  };
}

function contract(name: string, make: () => Promise<AssessmentRepository>): void {
  describe(`AssessmentRepository contract: ${name}`, () => {
    it("returns null before a save and the stored row after", async () => {
      const repo = await make();
      const session = makeSession(1);
      await expect(repo.getBySessionId(session.id)).resolves.toBeNull();

      const saved = await repo.saveIfAbsent(record(session.id, "a-1", 1));
      expect(saved).toEqual(record(session.id, "a-1", 1));
      await expect(repo.getBySessionId(session.id)).resolves.toEqual(saved);
    });

    it("is idempotent: a second save returns the first row and changes nothing", async () => {
      const repo = await make();
      const session = makeSession(2);
      await repo.saveIfAbsent(record(session.id, "a-1", 1));

      const second = await repo.saveIfAbsent(record(session.id, "a-2", 9));

      expect(second.id).toBe("a-1");
      expect(second.impactControl).toBe(1);
      await expect(repo.getBySessionId(session.id)).resolves.toMatchObject({ id: "a-1" });
    });

    it("stores six separate score fields and no composite", async () => {
      const repo = await make();
      const saved = await repo.saveIfAbsent(record(makeSession(3).id, "a-3", 1));
      expect(Object.keys(saved)).not.toContain("total");
      expect(Object.keys(saved)).not.toContain("composite");
    });
  });
}

contract("in-memory", async () => new InMemoryAssessmentRepository());

contract("D1 (Miniflare)", async () => {
  await d1.reset();
  const sessions = new D1SimulationRuntimeRepository(d1.db);
  await sessions.saveScenarioVersion(FIXTURE_SCENARIO);
  for (const n of [1, 2, 3]) {
    const session = makeSession(n);
    await sessions.createSession(session, makeEvent(session, 0));
  }
  return new D1AssessmentRepository(d1.db);
});
