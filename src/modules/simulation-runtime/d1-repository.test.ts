import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { D1SimulationRuntimeRepository, purgeInactiveSessions } from "./d1-repository.js";
import { InMemorySimulationRuntimeRepository, SimulationRuntimeService } from "./index.js";
import { createTestD1, type TestD1 } from "../../test-support/d1.js";
import {
  FIXTURE_SCENARIO,
  makeEvent,
  makeSession,
  runRepositoryContract,
  testKey,
} from "../../test-support/repository-contract.js";
import { D1AssessmentRepository } from "../scoring-debrief/d1-assessment-repository.js";
import { InMemoryRubricRepository, ScoringService } from "../scoring-debrief/index.js";
import type { AssessmentRecord } from "../scoring-debrief/index.js";

const DAY_MS = 86_400_000;
const NOW = new Date("2025-06-30T12:00:00.000Z");
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * DAY_MS).toISOString();

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

// The same contract suite runs against both adapters.
runRepositoryContract("in-memory", async () => ({
  repo: new InMemorySimulationRuntimeRepository(),
}));
runRepositoryContract("D1 (Miniflare)", async () => {
  await d1.reset();
  return { repo: new D1SimulationRuntimeRepository(d1.db) };
});

async function lastActivity(id: string): Promise<string | null> {
  const row = await d1.db
    .prepare("SELECT last_activity_at FROM scenario_sessions WHERE id = ?")
    .bind(id)
    .first<{ last_activity_at: string }>();
  return row?.last_activity_at ?? null;
}

async function count(table: string): Promise<number> {
  const row = await d1.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? 0;
}

describe("D1SimulationRuntimeRepository", () => {
  it("blocks UPDATE on session_events with the append-only trigger", async () => {
    const repo = new D1SimulationRuntimeRepository(d1.db);
    await repo.saveScenarioVersion(FIXTURE_SCENARIO);
    const session = makeSession(1);
    await repo.createSession(session, makeEvent(session, 0));

    await expect(
      d1.db
        .prepare("UPDATE session_events SET sim_time = 9 WHERE session_id = ?")
        .bind(session.id)
        .run(),
    ).rejects.toThrow(/append-only/);
    await expect(
      d1.db.prepare("DELETE FROM session_events WHERE session_id = ?").bind(session.id).run(),
    ).resolves.toBeDefined();
  });

  it("advances last_activity_at on writes only, never on reads", async () => {
    let now = new Date("2025-02-01T00:00:00.000Z");
    const repo = new D1SimulationRuntimeRepository(d1.db, { clock: () => now });
    await repo.saveScenarioVersion(FIXTURE_SCENARIO);
    const session = makeSession(2, { startedAt: "2025-01-01T00:00:00.000Z" });

    await repo.createSession(session, makeEvent(session, 0));
    expect(await lastActivity(session.id)).toBe("2025-01-01T00:00:00.000Z");

    now = new Date("2025-02-02T00:00:00.000Z");
    await repo.getSession(session.id);
    await repo.listEvents(session.id);
    await repo.getScenarioVersion(FIXTURE_SCENARIO.id, FIXTURE_SCENARIO.version);
    expect(await lastActivity(session.id)).toBe("2025-01-01T00:00:00.000Z");

    await repo.appendEvent(makeEvent(session, 1));
    expect(await lastActivity(session.id)).toBe("2025-02-02T00:00:00.000Z");

    now = new Date("2025-02-03T00:00:00.000Z");
    await repo.appendEventAndUpdateSession(makeEvent(session, 2), {
      ...session,
      simTimeElapsed: 1,
    });
    expect(await lastActivity(session.id)).toBe("2025-02-03T00:00:00.000Z");

    now = new Date("2025-02-04T00:00:00.000Z");
    await repo.updateSession({ ...session, status: "paused", pausedAt: now.toISOString() });
    expect(await lastActivity(session.id)).toBe("2025-02-04T00:00:00.000Z");
  });

  it("runs a full session and debrief through the D1 adapters", async () => {
    const repository = new D1SimulationRuntimeRepository(d1.db);
    const runtime = new SimulationRuntimeService({
      repository,
      scenarioSource: {
        getById: async () => structuredClone(FIXTURE_SCENARIO),
        getVersion: async () => structuredClone(FIXTURE_SCENARIO),
      },
    });
    const scoring = new ScoringService({
      sessions: repository,
      rubrics: new InMemoryRubricRepository(),
      assessments: new D1AssessmentRepository(d1.db),
    });

    const handle = await runtime.createSession(FIXTURE_SCENARIO.id);
    expect(handle.id).toHaveLength(43);
    const options = await runtime.getSessionOptions(handle.id);
    const first = options.actions.find((a) => a.available);
    expect(first).toBeDefined();
    await runtime.applyAction(handle.id, first?.id ?? "", "test rationale");
    await runtime.abandonSession(handle.id);

    const debrief = await scoring.computeDebrief(handle.id);
    expect(debrief.sessionStatus).toBe("abandoned");
    expect(debrief.endedAt).toBeTruthy();
    expect(await scoring.computeDebrief(handle.id)).toEqual(debrief);
    expect(await count("assessments")).toBe(1);
  });
});

describe("purgeInactiveSessions", () => {
  async function seed(n: number, activity: string, scenarioVersion = FIXTURE_SCENARIO.version) {
    const repo = new D1SimulationRuntimeRepository(d1.db);
    await repo.saveScenarioVersion({ ...FIXTURE_SCENARIO, version: scenarioVersion });
    const session = makeSession(n, { startedAt: activity, scenarioVersion });
    await repo.createSession(session, makeEvent(session, 0));
    await repo.appendEvent(makeEvent(session, 1, { wallTime: activity }));
    await d1.db
      .prepare("UPDATE scenario_sessions SET last_activity_at = ? WHERE id = ?")
      .bind(activity, session.id)
      .run();
    return session;
  }

  function assessment(sessionId: string): AssessmentRecord {
    return {
      id: `assessment-${sessionId}`,
      sessionId,
      rubricVersion: "1.0.0",
      impactControl: 1,
      diagnosticQuality: 2,
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
        terminalOutcome: null,
        terminalDebrief: null,
      },
      computedAt: NOW.toISOString(),
    };
  }

  it("keeps 29-day-old and recent sessions, deletes 31-day-old ones with events and assessments", async () => {
    const old = await seed(1, daysAgo(31));
    const nearlyOld = await seed(2, daysAgo(29));
    const pausedRecent = await seed(3, daysAgo(1));
    const assessments = new D1AssessmentRepository(d1.db);
    await assessments.saveIfAbsent(assessment(old.id));
    await assessments.saveIfAbsent(assessment(nearlyOld.id));

    const result = await purgeInactiveSessions(d1.db, NOW);

    expect(result.deleted).toBe(1);
    const repo = new D1SimulationRuntimeRepository(d1.db);
    await expect(repo.getSession(old.id)).resolves.toBeNull();
    await expect(repo.getSession(nearlyOld.id)).resolves.not.toBeNull();
    await expect(repo.getSession(pausedRecent.id)).resolves.not.toBeNull();
    expect(await repo.listEvents(old.id)).toEqual([]);
    await expect(assessments.getBySessionId(old.id)).resolves.toBeNull();
    await expect(assessments.getBySessionId(nearlyOld.id)).resolves.not.toBeNull();
    expect(await count("session_events")).toBe(4);
    expect(await count("assessments")).toBe(1);
  });

  it("removes orphan scenario snapshots but keeps those still referenced", async () => {
    await seed(1, daysAgo(40), "1.0.0");
    await seed(2, daysAgo(2), "1.1.0");

    await purgeInactiveSessions(d1.db, NOW);

    const repo = new D1SimulationRuntimeRepository(d1.db);
    await expect(repo.getScenarioVersion(FIXTURE_SCENARIO.id, "1.0.0")).resolves.toBeNull();
    await expect(repo.getScenarioVersion(FIXTURE_SCENARIO.id, "1.1.0")).resolves.not.toBeNull();
    expect(await count("scenario_versions")).toBe(1);
  });

  it("deletes in batches of 500 up to the per-run cap", async () => {
    const repo = new D1SimulationRuntimeRepository(d1.db);
    await repo.saveScenarioVersion(FIXTURE_SCENARIO);
    const stale = daysAgo(60);
    const statements = [];
    for (let i = 0; i < 520; i += 1) {
      statements.push(
        d1.db
          .prepare(
            "INSERT INTO scenario_sessions (id, scenario_id, scenario_version, rubric_version, status, started_at, sim_time_elapsed, last_activity_at) VALUES (?, ?, ?, ?, 'completed', ?, 0, ?)",
          )
          .bind(
            testKey(1000 + i),
            FIXTURE_SCENARIO.id,
            FIXTURE_SCENARIO.version,
            "1.0.0",
            stale,
            stale,
          ),
      );
    }
    for (let i = 0; i < statements.length; i += 100) {
      await d1.db.batch(statements.slice(i, i + 100));
    }

    const result = await purgeInactiveSessions(d1.db, NOW);

    expect(result.deleted).toBe(520);
    expect(await count("scenario_sessions")).toBe(0);
  });
});
