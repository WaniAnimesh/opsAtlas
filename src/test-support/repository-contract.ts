/**
 * Shared contract suite for `SimulationRuntimeRepository` implementations.
 * Run against the in-memory adapter and the D1 adapter (via Miniflare).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  SessionEvent,
  SessionRecord,
  SimulationRuntimeRepository,
} from "../modules/simulation-runtime/index.js";
import type { ScenarioContentFile } from "../types/index.js";

export const FIXTURE_SCENARIO = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "content/scenarios/scenario-kinesis-2021-v1@1.0.0.json"),
    "utf8",
  ),
) as ScenarioContentFile;

/** A 43-character id shaped like a Session_Key. */
export function testKey(n: number): string {
  return `k${String(n).padStart(42, "0")}`;
}

export function makeSession(n: number, overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: testKey(n),
    scenarioId: FIXTURE_SCENARIO.id,
    scenarioVersion: FIXTURE_SCENARIO.version,
    rubricVersion: FIXTURE_SCENARIO.rubric_version,
    status: "active",
    startedAt: "2025-01-01T00:00:00.000Z",
    simTimeElapsed: 0,
    ...overrides,
  };
}

export function makeEvent(
  session: SessionRecord,
  sequencePos: number,
  overrides: Partial<SessionEvent> = {},
): SessionEvent {
  const state = FIXTURE_SCENARIO.definition.states[FIXTURE_SCENARIO.definition.initial_state_id];
  if (state === undefined) throw new Error("fixture has no initial state");
  return {
    id: `event-${session.id}-${sequencePos}`,
    sessionId: session.id,
    sequencePos,
    simTime: 0,
    eventType: sequencePos === 0 ? "initial_state" : "evidence_request",
    payload: { n: sequencePos },
    stateSnapshot: structuredClone(state),
    wallTime: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const CONFLICT = { statusCode: 409, body: { error: { code: "SESSION_CONFLICT" } } };

export function runRepositoryContract(
  name: string,
  setup: () => Promise<{ repo: SimulationRuntimeRepository; cleanup?: () => Promise<void> }>,
): void {
  describe(`SimulationRuntimeRepository contract: ${name}`, () => {
    let repo: SimulationRuntimeRepository;
    let cleanup: (() => Promise<void>) | undefined;

    beforeEach(async () => {
      const made = await setup();
      repo = made.repo;
      cleanup = made.cleanup;
      await repo.saveScenarioVersion(FIXTURE_SCENARIO);
    });

    afterEach(async () => {
      await cleanup?.();
    });

    it("creates a session with its initial event and reads both back", async () => {
      const session = makeSession(1);
      await repo.createSession(session, makeEvent(session, 0));

      await expect(repo.getSession(session.id)).resolves.toEqual(session);
      const events = await repo.listEvents(session.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(makeEvent(session, 0));
      await expect(repo.getSession(testKey(99))).resolves.toBeNull();
      await expect(repo.listEvents(testKey(99))).resolves.toEqual([]);
    });

    it("keeps the first write of a scenario version (immutable snapshot)", async () => {
      const changed = { ...FIXTURE_SCENARIO, title: "Changed after publication" };
      await repo.saveScenarioVersion(changed);

      const stored = await repo.getScenarioVersion(FIXTURE_SCENARIO.id, FIXTURE_SCENARIO.version);
      expect(stored?.title).toBe(FIXTURE_SCENARIO.title);
      await expect(repo.getScenarioVersion(FIXTURE_SCENARIO.id, "9.9.9")).resolves.toBeNull();
    });

    it("appends events and lists them ordered by sequence position", async () => {
      const session = makeSession(2);
      await repo.createSession(session, makeEvent(session, 0));
      await repo.appendEvent(makeEvent(session, 2));
      await repo.appendEvent(makeEvent(session, 1));

      const events = await repo.listEvents(session.id);
      expect(events.map((e) => e.sequencePos)).toEqual([0, 1, 2]);
    });

    it("rejects a duplicate sequence position with SESSION_CONFLICT and keeps the original", async () => {
      const session = makeSession(3);
      await repo.createSession(session, makeEvent(session, 0));
      await repo.appendEvent(makeEvent(session, 1));

      await expect(
        repo.appendEvent(makeEvent(session, 1, { id: "other-event", payload: { n: "dup" } })),
      ).rejects.toMatchObject(CONFLICT);

      const events = await repo.listEvents(session.id);
      expect(events).toHaveLength(2);
      expect(events[1]?.payload).toEqual({ n: 1 });
    });

    it("applies event and session update together, or neither (batch atomicity)", async () => {
      const session = makeSession(4);
      await repo.createSession(session, makeEvent(session, 0));

      const advanced: SessionRecord = { ...session, simTimeElapsed: 5 };
      await repo.appendEventAndUpdateSession(makeEvent(session, 1, { simTime: 5 }), advanced);
      await expect(repo.getSession(session.id)).resolves.toMatchObject({ simTimeElapsed: 5 });
      await expect(repo.listEvents(session.id)).resolves.toHaveLength(2);

      const concluded: SessionRecord = {
        ...advanced,
        status: "completed",
        endedAt: "2025-01-01T01:00:00.000Z",
      };
      await expect(
        repo.appendEventAndUpdateSession(makeEvent(session, 1, { id: "dup" }), concluded),
      ).rejects.toMatchObject(CONFLICT);

      await expect(repo.getSession(session.id)).resolves.toMatchObject({
        status: "active",
        simTimeElapsed: 5,
      });
      await expect(repo.listEvents(session.id)).resolves.toHaveLength(2);
    });

    it("persists session updates including pause and end timestamps", async () => {
      const session = makeSession(5);
      await repo.createSession(session, makeEvent(session, 0));

      const paused: SessionRecord = {
        ...session,
        status: "paused",
        pausedAt: "2025-01-01T00:10:00.000Z",
      };
      await repo.updateSession(paused);
      await expect(repo.getSession(session.id)).resolves.toEqual(paused);

      const ended: SessionRecord = {
        id: session.id,
        scenarioId: session.scenarioId,
        scenarioVersion: session.scenarioVersion,
        rubricVersion: session.rubricVersion,
        status: "abandoned",
        startedAt: session.startedAt,
        endedAt: "2025-01-01T00:20:00.000Z",
        simTimeElapsed: 7,
      };
      await repo.updateSession(ended);
      await expect(repo.getSession(session.id)).resolves.toEqual(ended);
    });
  });
}
