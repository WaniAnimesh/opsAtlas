import {
  invalidInput,
  noActiveSession,
  scenarioVersionNotFound,
  sessionConflict,
  sessionNotFound,
  sessionPaused,
  type ApiErrorResponse,
} from "../../api/errors.js";
import type {
  EvidenceItem,
  ScenarioAction,
  ScenarioContentFile,
  ScenarioDefinition,
  ScenarioState,
  StateEffect,
} from "../../types/index.js";
import {
  applyTransition,
  listUnmetPreconditions,
  resolveEvidence,
  type PendingEvent,
  type TransitionSuccess,
} from "./engine.js";
import { generateSessionKey } from "./session-key.js";

export {
  SESSION_KEY_BYTES,
  SESSION_KEY_PATTERN,
  generateSessionKey,
  isWellFormedSessionKey,
  sessionKeyFingerprint,
} from "./session-key.js";

/** Lifecycle states persisted for every simulation session. */
export type SessionStatus = "active" | "paused" | "completed" | "abandoned" | "timed_out";

/** Event kinds understood by the append-only session event store. */
export type SessionEventType =
  "initial_state" | "action" | "evidence_request" | "pause" | "resume" | "abandon" | "timeout";

/** The durable session row represented independently of a database vendor. */
export interface SessionRecord {
  id: string;
  scenarioId: string;
  scenarioVersion: string;
  rubricVersion: string;
  status: SessionStatus;
  startedAt: string;
  pausedAt?: string;
  endedAt?: string;
  simTimeElapsed: number;
}

/** A persisted event, including the state observed at the event boundary. */
export interface SessionEvent {
  id: string;
  sessionId: string;
  sequencePos: number;
  simTime: number;
  eventType: SessionEventType;
  payload: Record<string, unknown>;
  stateSnapshot: ScenarioState;
  wallTime: string;
}

export interface SessionHandle {
  id: string;
  sessionId: string;
  scenarioId: string;
  scenarioVersion: string;
  rubricVersion: string;
  status: SessionStatus;
  startedAt: string;
  simTimeElapsed: number;
  state: ScenarioState;
}

/** The result returned after an action is applied and journaled. */
export interface ActionResult {
  status: "applied";
  sessionId: string;
  actionId: string;
  rationale: string;
  state: ScenarioState;
  simTimeElapsed: number;
  simTimeDelta: number;
  sideEffects: StateEffect[];
  pendingEvents: PendingEvent[];
  event: SessionEvent;
}

/** The result returned after an evidence request is journaled. */
export interface EvidenceResult {
  evidenceId: string;
  status: "available" | "unavailable";
  payload?: unknown;
  evidenceType?: EvidenceItem["type"];
  evidenceCategory?: EvidenceItem["category"];
  state: ScenarioState;
  simTime: number;
  simTimeElapsed: number;
  event: SessionEvent;
}

/** A reconstructed session and its ordered journal. */
export interface SessionState extends SessionRecord {
  state: ScenarioState;
  pendingEvents: PendingEvent[];
  events: SessionEvent[];
}

/** One action as offered in the session's current state. */
export interface ActionOption {
  id: string;
  label: string;
  time_cost: number;
  reversible: boolean;
  rationale_options: string[];
  available: boolean;
  unmetPreconditions: string[];
  /** Effect + side-effect fields; listed only for irreversible actions (Req 7.7). */
  modifiedAttributes?: string[];
}

/** One evidence item listed in the session's current state. */
export interface EvidenceOption {
  id: string;
  type: EvidenceItem["type"];
  category: EvidenceItem["category"];
  time_cost: number;
  requested: boolean;
}

/** Actions and evidence offered for the current state of a session. */
export interface SessionOptions {
  sessionId: string;
  status: SessionStatus;
  stateId: string;
  actions: ActionOption[];
  evidence: EvidenceOption[];
}

/** A source of published scenario definitions (latest version, or an exact pinned version). */
export interface ScenarioVersionSource {
  getById(id: string): Promise<ScenarioContentFile | null>;
  getVersion(id: string, version: string): Promise<ScenarioContentFile | null>;
}

/**
 * Storage boundary for session lifecycle operations.
 *
 * The interface mirrors the scenario_sessions, session_events, and immutable
 * scenario-version records needed by a Postgres or D1 adapter. Implementations
 * must clone values at the boundary so callers cannot mutate persisted data.
 */
export interface SimulationRuntimeRepository {
  saveScenarioVersion(scenario: ScenarioContentFile): Promise<void>;
  getScenarioVersion(scenarioId: string, version: string): Promise<ScenarioContentFile | null>;
  createSession(session: SessionRecord, initialEvent: SessionEvent): Promise<void>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  listEvents(sessionId: string): Promise<SessionEvent[]>;
  appendEvent(event: SessionEvent): Promise<void>;
  updateSession(session: SessionRecord): Promise<void>;
  appendEventAndUpdateSession(event: SessionEvent, session: SessionRecord): Promise<void>;
}

/** Dependencies required by the Worker-safe runtime service. */
export interface SimulationRuntimeOptions {
  repository: SimulationRuntimeRepository;
  scenarioSource: ScenarioVersionSource;
  /** Produces event and assessment ids (UUIDs by default). */
  idGenerator?: () => string;
  /** Produces the Session_Key used as the session id (default `generateSessionKey`). */
  sessionKeyGenerator?: () => string;
  clock?: () => Date;
}

/** Structured service error that preserves the API error convention. */
export class SimulationRuntimeError extends Error {
  public readonly statusCode: number;
  public readonly body: ApiErrorResponse["body"];
  public readonly response: ApiErrorResponse;

  public constructor(response: ApiErrorResponse) {
    super(response.body.error.message);
    this.name = "SimulationRuntimeError";
    this.statusCode = response.statusCode;
    this.body = response.body;
    this.response = response;
  }
}

/** Public lifecycle contract implemented by the runtime service. */
export interface SimulationRuntimeServiceContract {
  createSession(scenarioId: string, scenarioVersion?: string): Promise<SessionHandle>;
  getSession(sessionId: string): Promise<SessionState>;
  applyAction(sessionId: string, actionId: string, rationale: string): Promise<ActionResult>;
  requestEvidence(sessionId: string, evidenceId: string): Promise<EvidenceResult>;
  getSessionOptions(sessionId: string): Promise<SessionOptions>;
  pauseSession(sessionId: string): Promise<SessionState>;
  resumeSession(sessionId: string): Promise<SessionState>;
  abandonSession(sessionId: string): Promise<SessionState>;
}

interface SessionContext {
  session: SessionRecord;
  scenario: ScenarioContentFile;
  events: SessionEvent[];
  state: ScenarioState;
}

/**
 * Coordinates session creation and deterministic state reconstruction.
 *
 * It performs no filesystem, network, or database work itself. Published
 * scenario lookup and all persistence are supplied through injected ports.
 */
export class SimulationRuntimeService implements SimulationRuntimeServiceContract {
  private readonly idGenerator: () => string;
  private readonly sessionKeyGenerator: () => string;
  private readonly clock: () => Date;

  public constructor(private readonly options: SimulationRuntimeOptions) {
    this.idGenerator = options.idGenerator ?? defaultIdGenerator;
    this.sessionKeyGenerator = options.sessionKeyGenerator ?? generateSessionKey;
    this.clock = options.clock ?? defaultClock;
  }

  public async createSession(scenarioId: string, scenarioVersion?: string): Promise<SessionHandle> {
    const scenario =
      scenarioVersion === undefined
        ? await this.options.scenarioSource.getById(scenarioId)
        : await this.options.scenarioSource.getVersion(scenarioId, scenarioVersion);
    if (scenario === null) {
      throw new SimulationRuntimeError(scenarioVersionNotFound());
    }

    const initialState = scenario.definition.states[scenario.definition.initial_state_id];
    if (initialState === undefined) {
      throw new SimulationRuntimeError(scenarioVersionNotFound());
    }

    const sessionId = this.sessionKeyGenerator();
    const now = this.clock().toISOString();
    const session: SessionRecord = {
      id: sessionId,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      rubricVersion: scenario.rubric_version,
      status: "active",
      startedAt: now,
      simTimeElapsed: 0,
    };
    const initialEvent = createInitialEvent(
      this.idGenerator,
      session,
      cloneState(initialState),
      now,
    );

    // Persist the exact definition before the session row. The version key is
    // immutable in the repository, so later catalog edits cannot affect replay.
    await this.options.repository.saveScenarioVersion(cloneScenario(scenario));
    await this.options.repository.createSession(session, initialEvent);

    return toSessionHandle(session, initialEvent.stateSnapshot);
  }

  public async getSession(sessionId: string): Promise<SessionState> {
    const session = await this.options.repository.getSession(sessionId);
    if (session === null) {
      throw new SimulationRuntimeError(sessionNotFound());
    }

    const scenario = await this.options.repository.getScenarioVersion(
      session.scenarioId,
      session.scenarioVersion,
    );
    if (scenario === null) {
      throw new SimulationRuntimeError(scenarioVersionNotFound());
    }

    const events = await this.options.repository.listEvents(session.id);
    const state = replaySessionState(events, scenario.definition);
    return {
      ...cloneSession(session),
      state,
      pendingEvents: reconstructPendingEvents(events),
      events: events.map(cloneEvent),
    };
  }

  /**
   * Lists the actions and evidence for the session's current state using the
   * pinned scenario version. Read-only: nothing is journaled or persisted.
   */
  public async getSessionOptions(sessionId: string): Promise<SessionOptions> {
    const { session, scenario, events, state } = await this.loadSessionContext(sessionId);
    const definition = scenario.definition;

    const actions: ActionOption[] = Object.values(definition.actions).map((action) => {
      const unmet = listUnmetPreconditions(state, action);
      return {
        id: action.id,
        label: action.label,
        time_cost: action.time_cost,
        reversible: action.reversible,
        rationale_options: [...action.rationale_options],
        available: unmet.length === 0,
        unmetPreconditions: unmet,
        ...(action.reversible
          ? {}
          : {
              modifiedAttributes: [
                ...new Set([...action.effects, ...action.side_effects].map((e) => e.field)),
              ],
            }),
      };
    });

    const requestedIds = new Set(
      events
        .filter((e) => e.eventType === "evidence_request")
        .map((e) => e.payload["evidenceId"])
        .filter((id): id is string => typeof id === "string"),
    );
    const evidence: EvidenceOption[] = [];
    for (const id of state.evidence_available) {
      const item = definition.evidence[id];
      if (item === undefined) continue;
      evidence.push({
        id: item.id,
        type: item.type,
        category: item.category,
        time_cost: item.time_cost,
        requested: requestedIds.has(item.id),
      });
    }

    return { sessionId: session.id, status: session.status, stateId: state.id, actions, evidence };
  }

  public async applyAction(
    sessionId: string,
    actionId: string,
    rationale: string,
  ): Promise<ActionResult> {
    const context = await this.loadSessionContext(sessionId);
    this.assertSessionCanAdvance(context.session);

    const action = context.scenario.definition.actions[actionId];
    if (action === undefined) {
      throw new SimulationRuntimeError(invalidInput(`Action "${actionId}" was not found.`));
    }

    // Resolve and validate the transition before any repository write. A
    // failed precondition therefore cannot create a journal entry or alter
    // the stored session clock.
    const transition = applyTransition(context.state, action, context.scenario.definition);
    if (!isTransitionSuccess(transition)) {
      throw new SimulationRuntimeError(transition.error);
    }

    const simTimeBefore = context.session.simTimeElapsed;
    const simTimeAfter = simTimeBefore + transition.simTimeDelta;
    const event = createActionEvent(
      this.idGenerator,
      context.session,
      action,
      rationale,
      context.state,
      transition,
      simTimeBefore,
      simTimeAfter,
      nextSequencePosition(context.events),
      this.clock().toISOString(),
    );
    // Reaching a terminal state concludes the session in the same atomic
    // write as the action event (Req 9.3, 10.1).
    const reachedTerminal = transition.nextState.is_terminal;
    const now = this.clock().toISOString();
    const updatedSession: SessionRecord = {
      ...context.session,
      simTimeElapsed: simTimeAfter,
      ...(reachedTerminal ? { status: "completed" as const, endedAt: now } : {}),
    };

    await this.options.repository.appendEventAndUpdateSession(event, updatedSession);
    if (!reachedTerminal) {
      await this.timeOutIfExpired(
        updatedSession,
        context.scenario,
        transition.nextState,
        [...context.events, event],
        [...reconstructPendingEvents(context.events), ...transition.pendingEvents],
      );
    }

    return {
      status: "applied",
      sessionId: sessionId,
      actionId: action.id,
      rationale,
      state: cloneState(transition.nextState),
      simTimeElapsed: simTimeAfter,
      simTimeDelta: transition.simTimeDelta,
      sideEffects: transition.sideEffects.map(cloneValue),
      pendingEvents: transition.pendingEvents.map(cloneValue),
      event: cloneEvent(event),
    };
  }

  public async requestEvidence(sessionId: string, evidenceId: string): Promise<EvidenceResult> {
    const context = await this.loadSessionContext(sessionId);
    this.assertSessionCanAdvance(context.session);

    const evidence = context.scenario.definition.evidence[evidenceId];
    const resolution = resolveEvidence(context.state, evidenceId, context.scenario.definition);
    const isAvailable = resolution.status === "available" && evidence !== undefined;
    const simTimeBefore = context.session.simTimeElapsed;
    const timeCost = isAvailable ? evidence.time_cost : 0;
    const simTimeAfter = simTimeBefore + timeCost;
    const event = createEvidenceEvent(
      this.idGenerator,
      context.session,
      evidenceId,
      evidence,
      resolution,
      context.state,
      simTimeBefore,
      simTimeAfter,
      nextSequencePosition(context.events),
      this.clock().toISOString(),
    );

    const updatedSession: SessionRecord = {
      ...context.session,
      simTimeElapsed: simTimeAfter,
    };
    await this.options.repository.appendEventAndUpdateSession(event, updatedSession);
    await this.timeOutIfExpired(
      updatedSession,
      context.scenario,
      context.state,
      [...context.events, event],
      reconstructPendingEvents(context.events),
    );

    return {
      evidenceId,
      status: resolution.status,
      ...(resolution.payload === undefined ? {} : { payload: cloneValue(resolution.payload) }),
      ...(evidence === undefined
        ? {}
        : { evidenceType: evidence.type, evidenceCategory: evidence.category }),
      state: cloneState(context.state),
      simTime: simTimeBefore,
      simTimeElapsed: simTimeAfter,
      event: cloneEvent(event),
    };
  }

  public async pauseSession(sessionId: string): Promise<SessionState> {
    const context = await this.loadSessionContext(sessionId);
    if (context.session.status === "paused") {
      throw new SimulationRuntimeError(sessionPaused());
    }
    if (context.session.status !== "active") {
      throw new SimulationRuntimeError(noActiveSession());
    }

    const pausedAt = this.clock().toISOString();
    const event = createLifecycleEvent(
      this.idGenerator,
      context.session,
      "pause",
      context.state,
      context.events,
      context.session.simTimeElapsed,
      pausedAt,
      reconstructPendingEvents(context.events),
    );
    const updatedSession: SessionRecord = {
      ...context.session,
      status: "paused",
      pausedAt,
    };

    await this.options.repository.appendEventAndUpdateSession(event, updatedSession);
    return this.getSession(sessionId);
  }

  public async resumeSession(sessionId: string): Promise<SessionState> {
    const context = await this.loadSessionContext(sessionId);
    if (context.session.status !== "paused") {
      throw new SimulationRuntimeError(noActiveSession());
    }

    const resumedAt = this.clock().toISOString();
    const event = createLifecycleEvent(
      this.idGenerator,
      context.session,
      "resume",
      context.state,
      context.events,
      context.session.simTimeElapsed,
      resumedAt,
      reconstructPendingEvents(context.events),
    );
    const updatedSession: SessionRecord = {
      ...context.session,
      status: "active",
    };

    await this.options.repository.appendEventAndUpdateSession(event, updatedSession);
    return this.getSession(sessionId);
  }

  /** Concludes an active or paused session as abandoned (Req 9.3). */
  public async abandonSession(sessionId: string): Promise<SessionState> {
    const context = await this.loadSessionContext(sessionId);
    if (context.session.status !== "active" && context.session.status !== "paused") {
      throw new SimulationRuntimeError(noActiveSession());
    }

    const endedAt = this.clock().toISOString();
    const event = createLifecycleEvent(
      this.idGenerator,
      context.session,
      "abandon",
      context.state,
      context.events,
      context.session.simTimeElapsed,
      endedAt,
      reconstructPendingEvents(context.events),
    );
    await this.options.repository.appendEventAndUpdateSession(event, {
      ...context.session,
      status: "abandoned",
      endedAt,
    });
    return this.getSession(sessionId);
  }

  /** Marks the session timed_out once elapsed sim time exceeds the scenario limit. */
  private async timeOutIfExpired(
    session: SessionRecord,
    scenario: ScenarioContentFile,
    state: ScenarioState,
    events: readonly SessionEvent[],
    pendingEvents: readonly PendingEvent[],
  ): Promise<void> {
    const limit = scenario.time_limit_min;
    if (limit === undefined || session.simTimeElapsed <= limit) {
      return;
    }

    const endedAt = this.clock().toISOString();
    const event = createLifecycleEvent(
      this.idGenerator,
      session,
      "timeout",
      state,
      events,
      session.simTimeElapsed,
      endedAt,
      pendingEvents,
    );
    await this.options.repository.appendEventAndUpdateSession(event, {
      ...session,
      status: "timed_out",
      endedAt,
    });
  }

  private async loadSessionContext(sessionId: string): Promise<SessionContext> {
    const session = await this.options.repository.getSession(sessionId);
    if (session === null) {
      throw new SimulationRuntimeError(sessionNotFound());
    }

    const scenario = await this.options.repository.getScenarioVersion(
      session.scenarioId,
      session.scenarioVersion,
    );
    if (scenario === null) {
      throw new SimulationRuntimeError(scenarioVersionNotFound());
    }

    const events = await this.options.repository.listEvents(session.id);
    return {
      session,
      scenario,
      events,
      state: replaySessionState(events, scenario.definition),
    };
  }

  private assertSessionCanAdvance(session: SessionRecord): void {
    if (session.status === "paused") {
      throw new SimulationRuntimeError(sessionPaused());
    }
    if (session.status !== "active") {
      throw new SimulationRuntimeError(noActiveSession());
    }
  }
}

/** Creates the runtime service without selecting a concrete storage adapter. */
export function createSimulationRuntimeService(
  options: SimulationRuntimeOptions,
): SimulationRuntimeService {
  return new SimulationRuntimeService(options);
}

/**
 * An in-memory adapter for local development and unit tests.
 *
 * It stores the same conceptual rows as the database schema and uses the
 * scenario id/version pair as an immutable scenario-definition key.
 */
export class InMemorySimulationRuntimeRepository implements SimulationRuntimeRepository {
  private readonly scenarioVersions = new Map<string, ScenarioContentFile>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly events = new Map<string, SessionEvent[]>();

  public async saveScenarioVersion(scenario: ScenarioContentFile): Promise<void> {
    const key = scenarioVersionKey(scenario.id, scenario.version);
    if (!this.scenarioVersions.has(key)) {
      this.scenarioVersions.set(key, cloneScenario(scenario));
    }
  }

  public async getScenarioVersion(
    scenarioId: string,
    version: string,
  ): Promise<ScenarioContentFile | null> {
    const scenario = this.scenarioVersions.get(scenarioVersionKey(scenarioId, version));
    return scenario === undefined ? null : cloneScenario(scenario);
  }

  public async createSession(session: SessionRecord, initialEvent: SessionEvent): Promise<void> {
    this.sessions.set(session.id, cloneSession(session));
    this.events.set(session.id, [cloneEvent(initialEvent)]);
  }

  public async getSession(sessionId: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(sessionId);
    return session === undefined ? null : cloneSession(session);
  }

  public async listEvents(sessionId: string): Promise<SessionEvent[]> {
    return (this.events.get(sessionId) ?? []).map(cloneEvent).sort(sortEvents);
  }

  public async appendEvent(event: SessionEvent): Promise<void> {
    const sessionEvents = this.events.get(event.sessionId) ?? [];
    assertSequenceFree(sessionEvents, event);
    sessionEvents.push(cloneEvent(event));
    this.events.set(event.sessionId, sessionEvents.sort(sortEvents));
  }

  public async updateSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, cloneSession(session));
  }

  public async appendEventAndUpdateSession(
    event: SessionEvent,
    session: SessionRecord,
  ): Promise<void> {
    const sessionEvents = this.events.get(event.sessionId) ?? [];
    // Check before any mutation so a rejected append leaves the session row untouched.
    assertSequenceFree(sessionEvents, event);
    sessionEvents.push(cloneEvent(event));
    this.events.set(event.sessionId, sessionEvents.sort(sortEvents));
    this.sessions.set(session.id, cloneSession(session));
  }
}

/**
 * Append-only guard mirroring UNIQUE (session_id, sequence_pos) (Req 9.5).
 * The message never contains the session id, which is a Session_Key (Req 18.3).
 */
function assertSequenceFree(existing: readonly SessionEvent[], event: SessionEvent): void {
  if (existing.some((e) => e.sequencePos === event.sequencePos)) {
    throw new SimulationRuntimeError(sessionConflict());
  }
}

function createActionEvent(
  idGenerator: () => string,
  session: SessionRecord,
  action: ScenarioAction,
  rationale: string,
  stateBefore: ScenarioState,
  transition: TransitionSuccess,
  simTimeBefore: number,
  simTimeAfter: number,
  sequencePos: number,
  wallTime: string,
): SessionEvent {
  return {
    id: idGenerator(),
    sessionId: session.id,
    sequencePos,
    simTime: simTimeBefore,
    eventType: "action",
    payload: {
      actionId: action.id,
      rationale,
      preconditionsMet: true,
      simTimeBefore,
      simTimeAfter,
      stateBefore: cloneState(stateBefore),
      stateAfter: cloneState(transition.nextState),
      sideEffects: transition.sideEffects.map(cloneValue),
      pendingEvents: transition.pendingEvents.map(cloneValue),
      decisionJournal: {
        actionId: action.id,
        rationale,
        simTime: simTimeBefore,
        stateSnapshot: cloneState(stateBefore),
      },
    },
    stateSnapshot: cloneState(transition.nextState),
    wallTime,
  };
}

function createEvidenceEvent(
  idGenerator: () => string,
  session: SessionRecord,
  evidenceId: string,
  evidence: EvidenceItem | undefined,
  resolution: ReturnType<typeof resolveEvidence>,
  state: ScenarioState,
  simTimeBefore: number,
  simTimeAfter: number,
  sequencePos: number,
  wallTime: string,
): SessionEvent {
  const payload: Record<string, unknown> = {
    evidenceId,
    evidenceType: evidence?.type ?? null,
    evidenceCategory: evidence?.category ?? null,
    status: resolution.status,
    simTimeBefore,
    simTimeAfter,
    stateSnapshot: cloneState(state),
    decisionJournal: {
      evidenceId,
      evidenceType: evidence?.type ?? null,
      evidenceCategory: evidence?.category ?? null,
      status: resolution.status,
      simTime: simTimeBefore,
      stateSnapshot: cloneState(state),
    },
  };
  if (resolution.payload !== undefined) {
    payload["payload"] = cloneValue(resolution.payload);
  }

  return {
    id: idGenerator(),
    sessionId: session.id,
    sequencePos,
    simTime: simTimeBefore,
    eventType: "evidence_request",
    payload,
    stateSnapshot: cloneState(state),
    wallTime,
  };
}

function createLifecycleEvent(
  idGenerator: () => string,
  session: SessionRecord,
  eventType: "pause" | "resume" | "abandon" | "timeout",
  state: ScenarioState,
  events: readonly SessionEvent[],
  simTime: number,
  wallTime: string,
  pendingEvents: readonly PendingEvent[],
): SessionEvent {
  return {
    id: idGenerator(),
    sessionId: session.id,
    sequencePos: nextSequencePosition(events),
    simTime,
    eventType,
    payload: {
      statusBefore: session.status,
      statusAfter: LIFECYCLE_STATUS_AFTER[eventType],
      simTime,
      stateSnapshot: cloneState(state),
      pendingEvents: pendingEvents.map(cloneValue),
    },
    stateSnapshot: cloneState(state),
    wallTime,
  };
}

const LIFECYCLE_STATUS_AFTER: Record<"pause" | "resume" | "abandon" | "timeout", SessionStatus> = {
  pause: "paused",
  resume: "active",
  abandon: "abandoned",
  timeout: "timed_out",
};

function reconstructPendingEvents(events: readonly SessionEvent[]): PendingEvent[] {
  let pendingEvents: PendingEvent[] = [];

  for (const event of [...events].sort(sortEvents)) {
    if (event.eventType === "action") {
      pendingEvents = [...pendingEvents, ...readPendingEvents(event.payload)];
    } else if (event.eventType === "pause" || event.eventType === "resume") {
      pendingEvents = readPendingEvents(event.payload);
    }
  }

  return pendingEvents.map(cloneValue);
}

function readPendingEvents(payload: Record<string, unknown>): PendingEvent[] {
  const value = payload["pendingEvents"];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isPendingEvent).map((pendingEvent) => cloneValue(pendingEvent));
}

function isPendingEvent(value: unknown): value is PendingEvent {
  if (!isRecord(value) || typeof value["delay"] !== "number" || !isRecord(value["effect"])) {
    return false;
  }
  const effect = value["effect"];
  return (
    typeof effect["field"] === "string" && Object.prototype.hasOwnProperty.call(effect, "value")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nextSequencePosition(events: readonly SessionEvent[]): number {
  return events.reduce((highest, event) => Math.max(highest, event.sequencePos), -1) + 1;
}

function replaySessionState(
  events: readonly SessionEvent[],
  definition: ScenarioDefinition,
): ScenarioState {
  let state: ScenarioState | undefined;

  for (const event of [...events].sort(sortEvents)) {
    if (event.eventType === "initial_state") {
      state = cloneState(event.stateSnapshot);
      continue;
    }

    if (state === undefined) {
      state = cloneState(event.stateSnapshot);
      continue;
    }

    if (event.eventType === "action") {
      const actionId = readString(event.payload, "actionId");
      const action = actionId === null ? undefined : definition.actions[actionId];
      if (action !== undefined) {
        const result = applyTransition(state, action, definition);
        if (isTransitionSuccess(result)) {
          state = result.nextState;
          continue;
        }
      }
    }

    // Non-mutating lifecycle/evidence events, and legacy action events that
    // cannot be evaluated, retain their persisted boundary snapshot.
    state = cloneState(event.stateSnapshot);
  }

  if (state === undefined) {
    throw new Error("Session event log does not contain an initial state event.");
  }
  return state;
}

function createInitialEvent(
  idGenerator: () => string,
  session: SessionRecord,
  state: ScenarioState,
  wallTime: string,
): SessionEvent {
  return {
    id: idGenerator(),
    sessionId: session.id,
    sequencePos: 0,
    simTime: 0,
    eventType: "initial_state",
    payload: {
      scenario_id: session.scenarioId,
      scenario_version: session.scenarioVersion,
      state: cloneState(state),
    },
    stateSnapshot: cloneState(state),
    wallTime,
  };
}

function toSessionHandle(session: SessionRecord, state: ScenarioState): SessionHandle {
  return {
    id: session.id,
    sessionId: session.id,
    scenarioId: session.scenarioId,
    scenarioVersion: session.scenarioVersion,
    rubricVersion: session.rubricVersion,
    status: session.status,
    startedAt: session.startedAt,
    simTimeElapsed: session.simTimeElapsed,
    state: cloneState(state),
  };
}

function scenarioVersionKey(scenarioId: string, version: string): string {
  return `${scenarioId}\u0000${version}`;
}

function sortEvents(left: SessionEvent, right: SessionEvent): number {
  return left.sequencePos - right.sequencePos;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function isTransitionSuccess(
  result: ReturnType<typeof applyTransition>,
): result is TransitionSuccess {
  return "nextState" in result;
}

function defaultIdGenerator(): string {
  return crypto.randomUUID();
}

function defaultClock(): Date {
  return new Date();
}

function cloneScenario(scenario: ScenarioContentFile): ScenarioContentFile {
  return structuredClone(scenario);
}

function cloneSession(session: SessionRecord): SessionRecord {
  return structuredClone(session);
}

function cloneEvent(event: SessionEvent): SessionEvent {
  return structuredClone(event);
}

function cloneState(state: ScenarioState): ScenarioState {
  return structuredClone(state);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
