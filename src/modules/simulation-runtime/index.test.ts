import type { ScenarioContentFile, ScenarioState } from "../../types/index.js";
import {
  InMemorySimulationRuntimeRepository,
  SimulationRuntimeError,
  SimulationRuntimeService,
  type ScenarioVersionSource,
} from "./index.js";

function scenarioFixture(): ScenarioContentFile {
  return {
    id: "scenario-runtime-test",
    incident_slug: "incident-runtime-test",
    title: "Runtime test scenario",
    objective: "Practice session lifecycle persistence.",
    difficulty: "beginner",
    est_duration_min: 5,
    rubric_version: "rubric-1",
    skill_tags: ["observability"],
    version: "1.0.0",
    definition: {
      initial_state_id: "initial",
      states: {
        initial: {
          id: "initial",
          is_terminal: false,
          service_health: { api: "healthy" },
          metrics: { error_rate: 0 },
          dependencies: {},
          customer_impact: "none",
          evidence_available: [],
          active_alerts: [],
        },
      },
      actions: {},
      transitions: [],
      evidence: {},
    },
  };
}

function actionEvidenceScenarioFixture(): ScenarioContentFile {
  const scenario = scenarioFixture();
  const initial = scenario.definition.states["initial"];
  if (initial === undefined) throw new Error("Expected initial state fixture");

  const recovered: ScenarioState = {
    ...initial,
    id: "recovered",
    is_terminal: true,
    service_health: { api: "healthy" },
    metrics: { error_rate: 0 },
  };
  scenario.definition.states["recovered"] = recovered;
  initial.evidence_available = ["ev-logs"];
  scenario.definition.actions["mitigate"] = {
    id: "mitigate",
    label: "Mitigate the incident",
    preconditions: [{ field: "service_health.api", operator: "eq", value: "healthy" }],
    time_cost: 7,
    effects: [{ field: "metrics.error_rate", value: 0 }],
    side_effects: [],
    delayed_effects: [{ delay: 4, effect: { field: "active_alerts", value: ["FOLLOW_UP"] } }],
    reversible: false,
    rationale_options: ["Restore the service safely"],
  };
  scenario.definition.transitions.push({
    from_state_id: "initial",
    trigger: "mitigate",
    guard: null,
    to_state_id: "recovered",
    effects: [],
    delayed_effects: [],
  });
  scenario.definition.evidence = {
    "ev-logs": {
      id: "ev-logs",
      category: "Observable",
      type: "logs",
      time_cost: 3,
      payload: { entries: ["request failed"] },
    },
    "ev-metrics": {
      id: "ev-metrics",
      category: "Indicator",
      type: "metrics",
      time_cost: 5,
      payload: { error_rate: 12 },
    },
  };
  return scenario;
}

function createService(scenario: ScenarioContentFile = scenarioFixture()): {
  service: SimulationRuntimeService;
  repository: InMemorySimulationRuntimeRepository;
  source: ScenarioVersionSource;
} {
  const source: ScenarioVersionSource = {
    getById: async (id) => (id === scenario.id ? scenario : null),
    getVersion: async (id, v) => (id === scenario.id && v === scenario.version ? scenario : null),
  };
  const repository = new InMemorySimulationRuntimeRepository();
  const ids = ["event-1"];
  const service = new SimulationRuntimeService({
    repository,
    scenarioSource: source,
    idGenerator: () => ids.shift() ?? "unexpected-id",
    sessionKeyGenerator: () => "session-1",
    clock: () => new Date("2025-01-02T03:04:05.000Z"),
  });
  return { service, repository, source };
}

describe("SimulationRuntimeService session lifecycle", () => {
  it("creates an active session and persists an initial state event", async () => {
    const { service, repository } = createService();

    const handle = await service.createSession("scenario-runtime-test");
    const session = await service.getSession(handle.sessionId);
    const events = await repository.listEvents(handle.sessionId);

    expect(handle).toMatchObject({
      id: "session-1",
      sessionId: "session-1",
      scenarioId: "scenario-runtime-test",
      scenarioVersion: "1.0.0",
      rubricVersion: "rubric-1",
      status: "active",
      startedAt: "2025-01-02T03:04:05.000Z",
      simTimeElapsed: 0,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "event-1",
      sequencePos: 0,
      simTime: 0,
      eventType: "initial_state",
      wallTime: "2025-01-02T03:04:05.000Z",
    });
    expect(session.state).toEqual(handle.state);
    expect(session.events).toEqual(events);
  });

  it("pins the exact scenario and rubric version for replay", async () => {
    const scenario = scenarioFixture();
    const { service } = createService(scenario);

    const handle = await service.createSession(scenario.id);
    scenario.version = "2.0.0";
    scenario.rubric_version = "rubric-2";
    scenario.definition.initial_state_id = "changed-after-start";

    const session = await service.getSession(handle.id);

    expect(session.scenarioVersion).toBe("1.0.0");
    expect(session.rubricVersion).toBe("rubric-1");
    expect(session.state.id).toBe("initial");
  });

  it("returns the session-not-found convention for unknown session ids", async () => {
    const { service } = createService();
    const handle = await service.createSession("scenario-runtime-test");

    await expect(service.getSession("missing")).rejects.toMatchObject({
      statusCode: 404,
      body: { error: { code: "SESSION_NOT_FOUND" } },
    });
    await expect(service.getSession(`${handle.id}-other`)).rejects.toBeInstanceOf(
      SimulationRuntimeError,
    );
  });

  it("applies an action, advances time, and records journal state context", async () => {
    const { service, repository } = createService(actionEvidenceScenarioFixture());
    const handle = await service.createSession("scenario-runtime-test");

    const result = await service.applyAction(
      handle.sessionId,
      "mitigate",
      "Restore the service safely",
    );
    const events = await repository.listEvents(handle.sessionId);
    const session = await service.getSession(handle.sessionId);

    expect(result).toMatchObject({
      status: "applied",
      actionId: "mitigate",
      simTimeDelta: 7,
      simTimeElapsed: 7,
      state: { id: "recovered" },
    });
    expect(result.pendingEvents).toEqual([
      { delay: 4, effect: { field: "active_alerts", value: ["FOLLOW_UP"] } },
    ]);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      sequencePos: 1,
      simTime: 0,
      eventType: "action",
      stateSnapshot: { id: "recovered" },
      payload: {
        actionId: "mitigate",
        rationale: "Restore the service safely",
        preconditionsMet: true,
        simTimeBefore: 0,
        simTimeAfter: 7,
        stateBefore: { id: "initial" },
        stateAfter: { id: "recovered" },
        decisionJournal: {
          actionId: "mitigate",
          rationale: "Restore the service safely",
          simTime: 0,
          stateSnapshot: { id: "initial" },
        },
      },
    });
    expect(session.simTimeElapsed).toBe(7);
    expect(session.state.id).toBe("recovered");
  });

  it("rejects an action precondition without persisting an event or changing time", async () => {
    const scenario = actionEvidenceScenarioFixture();
    const action = scenario.definition.actions["mitigate"];
    if (action === undefined) throw new Error("Expected action fixture");
    action.preconditions = [{ field: "service_health.api", operator: "eq", value: "degraded" }];
    const { service, repository } = createService(scenario);
    const handle = await service.createSession(scenario.id);

    await expect(
      service.applyAction(handle.sessionId, "mitigate", "This should fail"),
    ).rejects.toMatchObject({
      statusCode: 422,
      body: { error: { code: "ACTION_PRECONDITION_FAILED" } },
    });
    expect(await repository.listEvents(handle.sessionId)).toHaveLength(1);
    expect((await service.getSession(handle.sessionId)).simTimeElapsed).toBe(0);
  });

  it("records available evidence and advances only by its configured cost", async () => {
    const { service, repository } = createService(actionEvidenceScenarioFixture());
    const handle = await service.createSession("scenario-runtime-test");

    const result = await service.requestEvidence(handle.sessionId, "ev-logs");
    const events = await repository.listEvents(handle.sessionId);

    expect(result).toMatchObject({
      evidenceId: "ev-logs",
      status: "available",
      evidenceType: "logs",
      evidenceCategory: "Observable",
      payload: { entries: ["request failed"] },
      simTime: 0,
      simTimeElapsed: 3,
    });
    expect(events[1]).toMatchObject({
      sequencePos: 1,
      simTime: 0,
      eventType: "evidence_request",
      stateSnapshot: { id: "initial" },
      payload: {
        evidenceId: "ev-logs",
        evidenceType: "logs",
        evidenceCategory: "Observable",
        status: "available",
        simTimeBefore: 0,
        simTimeAfter: 3,
        stateSnapshot: { id: "initial" },
        decisionJournal: {
          evidenceId: "ev-logs",
          evidenceType: "logs",
          evidenceCategory: "Observable",
          simTime: 0,
          stateSnapshot: { id: "initial" },
        },
      },
    });
  });

  it("records unavailable evidence explicitly without advancing time", async () => {
    const { service, repository } = createService(actionEvidenceScenarioFixture());
    const handle = await service.createSession("scenario-runtime-test");

    const result = await service.requestEvidence(handle.sessionId, "ev-metrics");
    const events = await repository.listEvents(handle.sessionId);

    expect(result).toMatchObject({
      evidenceId: "ev-metrics",
      status: "unavailable",
      evidenceType: "metrics",
      evidenceCategory: "Indicator",
      simTime: 0,
      simTimeElapsed: 0,
    });
    expect(result).not.toHaveProperty("payload");
    expect(events).toHaveLength(2);
    expect(events[1]).toBeDefined();
    expect(events[1]?.payload).toMatchObject({
      evidenceId: "ev-metrics",
      status: "unavailable",
      simTimeBefore: 0,
      simTimeAfter: 0,
    });
  });

  it("rejects paused and concluded sessions before writing journal entries", async () => {
    const { service, repository } = createService(actionEvidenceScenarioFixture());
    const handle = await service.createSession("scenario-runtime-test");

    const paused = await repository.getSession(handle.sessionId);
    if (paused === null) throw new Error("Expected session fixture");
    await repository.updateSession({ ...paused, status: "paused" });
    await expect(service.requestEvidence(handle.sessionId, "ev-logs")).rejects.toMatchObject({
      body: { error: { code: "SESSION_PAUSED" } },
    });

    await repository.updateSession({ ...paused, status: "completed" });
    await expect(
      service.applyAction(handle.sessionId, "mitigate", "Too late"),
    ).rejects.toMatchObject({ body: { error: { code: "NO_ACTIVE_SESSION" } } });
    expect(await repository.listEvents(handle.sessionId)).toHaveLength(1);
  });

  it("pauses and resumes without changing simulated time, state, pending events, or journal decisions", async () => {
    // Keep the post-action state non-terminal: terminal states now conclude the session.
    const scenario = actionEvidenceScenarioFixture();
    const recovered = scenario.definition.states["recovered"];
    if (recovered === undefined) throw new Error("Expected recovered fixture");
    recovered.is_terminal = false;
    const { service, repository } = createService(scenario);
    const handle = await service.createSession("scenario-runtime-test");

    await service.applyAction(handle.sessionId, "mitigate", "Restore the service safely");
    const atPauseBoundary = await service.getSession(handle.sessionId);

    const paused = await service.pauseSession(handle.sessionId);
    expect(paused.status).toBe("paused");
    expect(paused.pausedAt).toBe("2025-01-02T03:04:05.000Z");
    expect(paused.simTimeElapsed).toBe(atPauseBoundary.simTimeElapsed);
    expect(paused.state).toEqual(atPauseBoundary.state);
    expect(paused.pendingEvents).toEqual(atPauseBoundary.pendingEvents);

    const resumed = await service.resumeSession(handle.sessionId);
    expect(resumed.status).toBe("active");
    expect(resumed.simTimeElapsed).toBe(atPauseBoundary.simTimeElapsed);
    expect(resumed.state).toEqual(atPauseBoundary.state);
    expect(resumed.pendingEvents).toEqual(atPauseBoundary.pendingEvents);
    expect(resumed.events.filter((event) => event.eventType === "action")).toEqual(
      atPauseBoundary.events.filter((event) => event.eventType === "action"),
    );
    expect(resumed.events.map((event) => event.eventType)).toEqual([
      "initial_state",
      "action",
      "pause",
      "resume",
    ]);

    const events = await repository.listEvents(handle.sessionId);
    expect(events[2]).toMatchObject({
      eventType: "pause",
      simTime: 7,
      stateSnapshot: atPauseBoundary.state,
      payload: { simTime: 7, pendingEvents: atPauseBoundary.pendingEvents },
    });
    expect(events[3]).toMatchObject({
      eventType: "resume",
      simTime: 7,
      stateSnapshot: atPauseBoundary.state,
      payload: { simTime: 7, pendingEvents: atPauseBoundary.pendingEvents },
    });
  });

  it("rejects pause and resume of unknown sessions without writing lifecycle events", async () => {
    const { service, repository } = createService();
    const handle = await service.createSession("scenario-runtime-test");

    await expect(service.pauseSession("missing")).rejects.toMatchObject({
      statusCode: 404,
      body: { error: { code: "SESSION_NOT_FOUND" } },
    });
    expect(await repository.listEvents(handle.sessionId)).toHaveLength(1);

    await service.pauseSession(handle.sessionId);
    await expect(service.resumeSession("missing")).rejects.toMatchObject({
      statusCode: 404,
      body: { error: { code: "SESSION_NOT_FOUND" } },
    });
    expect((await service.getSession(handle.sessionId)).status).toBe("paused");
    expect(await repository.listEvents(handle.sessionId)).toHaveLength(2);
  });

  it("rejects invalid pause and resume transitions without partial events", async () => {
    const { service, repository } = createService();
    const handle = await service.createSession("scenario-runtime-test");

    await expect(service.resumeSession(handle.sessionId)).rejects.toMatchObject({
      body: { error: { code: "NO_ACTIVE_SESSION" } },
    });
    expect(await repository.listEvents(handle.sessionId)).toHaveLength(1);

    await service.pauseSession(handle.sessionId);
    await expect(service.pauseSession(handle.sessionId)).rejects.toMatchObject({
      body: { error: { code: "SESSION_PAUSED" } },
    });
    expect(await repository.listEvents(handle.sessionId)).toHaveLength(2);

    const session = await repository.getSession(handle.sessionId);
    if (session === null) throw new Error("Expected session fixture");
    await repository.updateSession({
      ...session,
      status: "completed",
      endedAt: "2025-01-02T03:05:00.000Z",
    });
    await expect(service.resumeSession(handle.sessionId)).rejects.toMatchObject({
      body: { error: { code: "NO_ACTIVE_SESSION" } },
    });
    expect(await repository.listEvents(handle.sessionId)).toHaveLength(2);
  });

  it("allows action and evidence mutations again after resume", async () => {
    const { service, repository } = createService(actionEvidenceScenarioFixture());
    const handle = await service.createSession("scenario-runtime-test");

    await service.pauseSession(handle.sessionId);
    await expect(service.requestEvidence(handle.sessionId, "ev-logs")).rejects.toMatchObject({
      body: { error: { code: "SESSION_PAUSED" } },
    });
    await service.resumeSession(handle.sessionId);

    const result = await service.requestEvidence(handle.sessionId, "ev-logs");
    expect(result.status).toBe("available");
    expect(result.simTimeElapsed).toBe(3);
    expect((await repository.listEvents(handle.sessionId)).map((event) => event.eventType)).toEqual(
      ["initial_state", "pause", "resume", "evidence_request"],
    );
  });
});

describe("SimulationRuntimeService session conclusion", () => {
  it("abandons an active or paused session atomically and rejects further changes", async () => {
    const { service, repository } = createService(actionEvidenceScenarioFixture());
    const handle = await service.createSession("scenario-runtime-test");
    await service.pauseSession(handle.sessionId);

    const abandoned = await service.abandonSession(handle.sessionId);

    expect(abandoned.status).toBe("abandoned");
    expect(abandoned.endedAt).toBe("2025-01-02T03:04:05.000Z");
    const events = await repository.listEvents(handle.sessionId);
    expect(events[events.length - 1]).toMatchObject({
      eventType: "abandon",
      payload: { statusBefore: "paused", statusAfter: "abandoned" },
    });
    await expect(service.abandonSession(handle.sessionId)).rejects.toMatchObject({
      body: { error: { code: "NO_ACTIVE_SESSION" } },
    });
    await expect(
      service.applyAction(handle.sessionId, "mitigate", "Too late"),
    ).rejects.toMatchObject({ body: { error: { code: "NO_ACTIVE_SESSION" } } });
  });

  it("rejects abandoning an unknown session", async () => {
    const { service } = createService();
    const handle = await service.createSession("scenario-runtime-test");

    await expect(service.abandonSession("missing")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect((await service.getSession(handle.sessionId)).status).toBe("active");
  });

  it("completes the session when an action reaches a terminal state", async () => {
    const { service } = createService(actionEvidenceScenarioFixture());
    const handle = await service.createSession("scenario-runtime-test");

    await service.applyAction(handle.sessionId, "mitigate", "Restore the service");
    const session = await service.getSession(handle.sessionId);

    expect(session.status).toBe("completed");
    expect(session.endedAt).toBe("2025-01-02T03:04:05.000Z");
    expect(session.events.map((event) => event.eventType)).toEqual(["initial_state", "action"]);
    await expect(service.pauseSession(handle.sessionId)).rejects.toMatchObject({
      body: { error: { code: "NO_ACTIVE_SESSION" } },
    });
  });

  it("times out the session when elapsed time exceeds the scenario limit", async () => {
    const scenario = actionEvidenceScenarioFixture();
    const recovered = scenario.definition.states["recovered"];
    if (recovered === undefined) throw new Error("Expected recovered fixture");
    recovered.is_terminal = false;
    scenario.time_limit_min = 5;
    const { service } = createService(scenario);
    const handle = await service.createSession(scenario.id);

    await service.applyAction(handle.sessionId, "mitigate", "Slow fix"); // 7 > 5
    const session = await service.getSession(handle.sessionId);

    expect(session.status).toBe("timed_out");
    expect(session.endedAt).toBeDefined();
    expect(session.events.map((event) => event.eventType)).toEqual([
      "initial_state",
      "action",
      "timeout",
    ]);
  });

  it("keeps the session active while within the time limit", async () => {
    const scenario = actionEvidenceScenarioFixture();
    scenario.time_limit_min = 3;
    const { service } = createService(scenario);
    const handle = await service.createSession(scenario.id);

    await service.requestEvidence(handle.sessionId, "ev-logs"); // 3, not > 3
    expect((await service.getSession(handle.sessionId)).status).toBe("active");
  });
});
