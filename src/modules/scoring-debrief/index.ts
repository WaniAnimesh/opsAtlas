import {
  invalidInput,
  rubricVersionUnavailable,
  scenarioVersionNotFound,
  sessionNotFound,
  type ApiErrorResponse,
} from "../../api/errors.js";
import type {
  ScenarioAction,
  ScenarioContentFile,
  ScenarioDefinition,
  ScenarioState,
} from "../../types/index.js";
import type { ContentBundle } from "../../content/bundle.js";
import { applyTransition } from "../simulation-runtime/engine.js";
import type { RubricDefinition, TerminalStateMapping } from "./rubric.js";

export { isRubricDefinition } from "./rubric.js";
export type { RubricDefinition, TerminalStateMapping } from "./rubric.js";
import type {
  SessionEvent,
  SessionRecord,
  SessionStatus,
  SimulationRuntimeRepository,
} from "../simulation-runtime/index.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Stable keys of the six independent Score_Dimensions (Req 10.2). */
export const SCORE_DIMENSIONS = [
  "impactControl",
  "diagnosticQuality",
  "riskManagement",
  "recoveryQuality",
  "communication",
  "learningReflection",
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

/** Human-readable label for each dimension. */
export const DIMENSION_LABELS: Record<ScoreDimension, string> = {
  impactControl: "Impact Control",
  diagnosticQuality: "Diagnostic Quality",
  riskManagement: "Risk Management",
  recoveryQuality: "Recovery Quality",
  communication: "Communication",
  learningReflection: "Learning/Reflection",
};

/** A separately labelled score for one dimension. */
export type DimensionScores = Record<ScoreDimension, number>;
export type DimensionFeedback = Record<ScoreDimension, string>;

/** Persisted assessments row. Six flat score columns; no composite column. */
export interface AssessmentRecord {
  id: string;
  sessionId: string;
  rubricVersion: string;
  impactControl: number;
  diagnosticQuality: number;
  riskManagement: number;
  recoveryQuality: number;
  communication: number;
  learningReflection: number;
  feedback: DimensionFeedback & { terminalOutcome: string | null; terminalDebrief: string | null };
  computedAt: string;
}

/** Debrief returned to callers. Contains no composite/total score. */
export interface DebriefResult {
  sessionId: string;
  scenarioId: string;
  scenarioVersion: string;
  rubricVersion: string;
  sessionStatus: SessionStatus;
  /** Slug of the source incident, for the Atlas link (Req 10.6). */
  incidentSlug: string;
  maxScore: number;
  scores: DimensionScores;
  labels: Record<ScoreDimension, string>;
  feedback: DimensionFeedback;
  terminalOutcome: string | null;
  terminalDebrief: string | null;
  /** The session's `ended_at` (ISO 8601). */
  endedAt: string;
  computedAt: string;
}

/** Reader port over the session journal (subset of SimulationRuntimeRepository). */
export type SessionJournalReader = Pick<
  SimulationRuntimeRepository,
  "getSession" | "listEvents" | "getScenarioVersion"
>;

/** Read-only Rubric storage keyed by version (bundle content). */
export interface RubricRepository {
  getByVersion(version: string): Promise<RubricDefinition | null>;
}

/** Assessment storage; one row per session (UNIQUE session_id). */
export interface AssessmentRepository {
  getBySessionId(sessionId: string): Promise<AssessmentRecord | null>;
  /** Inserts the row unless one exists for the session; returns the stored row. */
  saveIfAbsent(record: AssessmentRecord): Promise<AssessmentRecord>;
}

/** Maximum length of an alternative's explanation text (Req 10.4). */
export const MAX_ALTERNATIVE_DESCRIPTION_LENGTH = 200;

/** An evidence item revealed or still available at a replay step. */
export interface ReplayEvidenceRef {
  evidenceId: string;
  category: string;
  type: string;
}

/** A defined alternative to the decision taken at a replay step (Req 10.4). */
export interface ReplayAlternative {
  kind: "action" | "evidence";
  /** Action id or evidence id. */
  id: string;
  label: string;
  /** At most 200 characters. */
  description: string;
}

/** One Decision_Journal entry replayed against the pinned scenario (Req 10.3). */
export interface ReplayStep {
  sessionId: string;
  /** 0-based index over action/evidence_request journal entries. */
  step: number;
  totalSteps: number;
  sequencePos: number;
  eventType: "action" | "evidence_request";
  simTime: number;
  /** Decision taken at this step. */
  actionId: string | null;
  evidenceId: string | null;
  /** Scenario state before the decision. */
  state: ScenarioState;
  /** Evidence revealed by earlier steps. */
  revealedEvidence: ReplayEvidenceRef[];
  /** Evidence available in this state but not yet requested (Req 10.5). */
  unrequestedEvidence: ReplayEvidenceRef[];
  alternatives: ReplayAlternative[];
  /** Explicit statement when no alternative is defined. */
  noAlternativesNote: string | null;
}

export interface ScoringServiceContract {
  computeDebrief(sessionId: string): Promise<DebriefResult>;
  getReplayStep(sessionId: string, step: number): Promise<ReplayStep>;
}

export interface ScoringServiceOptions {
  sessions: SessionJournalReader;
  rubrics: RubricRepository;
  assessments: AssessmentRepository;
  idGenerator?: () => string;
  clock?: () => Date;
}

/** Structured error preserving the API error convention. */
export class ScoringError extends Error {
  public readonly statusCode: number;
  public readonly body: ApiErrorResponse["body"];
  public readonly response: ApiErrorResponse;

  public constructor(response: ApiErrorResponse) {
    super(response.body.error.message);
    this.name = "ScoringError";
    this.statusCode = response.statusCode;
    this.body = response.body;
    this.response = response;
  }
}

/** Active or paused sessions cannot be debriefed yet. */
export function sessionNotConcluded(status: SessionStatus): ApiErrorResponse {
  return {
    statusCode: 409,
    body: {
      error: {
        code: "SESSION_NOT_CONCLUDED",
        message: "The session must be completed, abandoned or timed out before a debrief.",
        details: { status },
      },
    },
  };
}

// ─── Default rubric ───────────────────────────────────────────────────────────

export const DEFAULT_RUBRIC_VERSION = "1.0.0";

/** Default rubric matching the example scenario fixture (rubric_version "1.0.0"). */
export function createDefaultRubric(): RubricDefinition {
  return {
    version: DEFAULT_RUBRIC_VERSION,
    maxScore: 10,
    criteria: {
      impactControl: {
        description:
          "Simulated time elapsed relative to the scenario time limit; less elapsed is better. Timed-out sessions score 0.",
      },
      diagnosticQuality: {
        description:
          "Available evidence requested before the first mitigating action (an action with state effects).",
        minEvidenceBeforeMitigation: 1,
      },
      riskManagement: {
        description:
          "Irreversible actions taken only after at least one piece of evidence was gathered.",
      },
      recoveryQuality: {
        description: "Whether the session ended in a terminal state, weighted by terminal mapping.",
        unmappedTerminalFraction: 1,
      },
      communication: {
        description:
          "Use of declare/notify/page/escalate-type actions, each with a rationale provided.",
        actionKeywords: ["declare", "notify", "page", "escalate", "communicate", "announce"],
      },
      learningReflection: {
        description:
          "Share of actions whose rationale was chosen from the offered rationale options.",
      },
    },
    terminalStates: {
      "state-mitigated": {
        outcome: "mitigated",
        recoveryFraction: 1,
        debrief: "The incident was mitigated and services returned to a healthy state.",
      },
    },
  };
}

// ─── In-memory adapters ───────────────────────────────────────────────────────

export class InMemoryRubricRepository implements RubricRepository {
  private readonly rubrics = new Map<string, RubricDefinition>();

  public constructor(initial: RubricDefinition[] = [createDefaultRubric()]) {
    for (const rubric of initial) this.rubrics.set(rubric.version, structuredClone(rubric));
  }

  public async getByVersion(version: string): Promise<RubricDefinition | null> {
    const rubric = this.rubrics.get(version);
    return rubric === undefined ? null : structuredClone(rubric);
  }
}

/** Rubric repository over the build-time content bundle (Worker). */
export class BundledRubricRepository extends InMemoryRubricRepository {
  public constructor(bundle: Pick<ContentBundle, "rubrics">) {
    super(bundle.rubrics);
  }
}

export class InMemoryAssessmentRepository implements AssessmentRepository {
  private readonly bySession = new Map<string, AssessmentRecord>();

  public async getBySessionId(sessionId: string): Promise<AssessmentRecord | null> {
    const record = this.bySession.get(sessionId);
    return record === undefined ? null : structuredClone(record);
  }

  public async saveIfAbsent(record: AssessmentRecord): Promise<AssessmentRecord> {
    const existing = this.bySession.get(record.sessionId);
    if (existing !== undefined) return structuredClone(existing);
    this.bySession.set(record.sessionId, structuredClone(record));
    return structuredClone(record);
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

const CONCLUDED: readonly SessionStatus[] = ["completed", "abandoned", "timed_out"];

export class ScoringService implements ScoringServiceContract {
  private readonly idGenerator: () => string;
  private readonly clock: () => Date;

  public constructor(private readonly options: ScoringServiceOptions) {
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
    this.clock = options.clock ?? (() => new Date());
  }

  public async computeDebrief(sessionId: string): Promise<DebriefResult> {
    const session = await this.options.sessions.getSession(sessionId);
    if (session === null) {
      throw new ScoringError(sessionNotFound());
    }
    if (!CONCLUDED.includes(session.status)) {
      throw new ScoringError(sessionNotConcluded(session.status));
    }

    // Req 19.5: the pinned rubric must exist before any scoring happens.
    const rubric = await this.options.rubrics.getByVersion(session.rubricVersion);
    if (rubric === null) {
      throw new ScoringError(rubricVersionUnavailable(session.rubricVersion));
    }

    const scenario = await this.options.sessions.getScenarioVersion(
      session.scenarioId,
      session.scenarioVersion,
    );
    if (scenario === null) {
      throw new ScoringError(scenarioVersionNotFound());
    }

    const existing = await this.options.assessments.getBySessionId(session.id);
    if (existing !== null) {
      return toDebriefResult(session, scenario, rubric, existing);
    }

    const events = [...(await this.options.sessions.listEvents(session.id))].sort(
      (a, b) => a.sequencePos - b.sequencePos,
    );
    const { scores, feedback, terminal } = scoreSession(session, scenario, events, rubric);
    const stored = await this.options.assessments.saveIfAbsent({
      id: this.idGenerator(),
      sessionId: session.id,
      rubricVersion: rubric.version,
      ...scores,
      feedback: {
        ...feedback,
        terminalOutcome: terminal?.outcome ?? null,
        terminalDebrief: terminal?.debrief ?? null,
      },
      computedAt: this.clock().toISOString(),
    });
    return toDebriefResult(session, scenario, rubric, stored);
  }

  /** Replays one journal decision against the pinned scenario version (Req 10.3-10.5). */
  public async getReplayStep(sessionId: string, step: number): Promise<ReplayStep> {
    const session = await this.options.sessions.getSession(sessionId);
    if (session === null) {
      throw new ScoringError(sessionNotFound());
    }
    if (!CONCLUDED.includes(session.status)) {
      throw new ScoringError(sessionNotConcluded(session.status));
    }
    const scenario = await this.options.sessions.getScenarioVersion(
      session.scenarioId,
      session.scenarioVersion,
    );
    if (scenario === null) {
      throw new ScoringError(scenarioVersionNotFound());
    }

    const events = [...(await this.options.sessions.listEvents(session.id))].sort(
      (a, b) => a.sequencePos - b.sequencePos,
    );
    const decisions = events.filter(
      (e) => e.eventType === "action" || e.eventType === "evidence_request",
    );
    if (!Number.isInteger(step) || step < 0 || step >= decisions.length) {
      throw new ScoringError(
        invalidInput(`step must be an integer between 0 and ${Math.max(0, decisions.length - 1)}.`),
      );
    }
    const event = decisions[step] as SessionEvent;
    const { definition } = scenario;
    const state = stateBefore(event);

    const requested = new Set(
      events
        .filter((e) => e.eventType === "evidence_request" && e.sequencePos < event.sequencePos)
        .map((e) => e.payload["evidenceId"])
        .filter((id): id is string => typeof id === "string"),
    );
    const revealed = new Set(
      events
        .filter(
          (e) =>
            e.eventType === "evidence_request" &&
            e.sequencePos < event.sequencePos &&
            e.payload["status"] === "available",
        )
        .map((e) => e.payload["evidenceId"])
        .filter((id): id is string => typeof id === "string"),
    );
    const evidenceRef = (id: string): ReplayEvidenceRef => ({
      evidenceId: id,
      category: definition.evidence[id]?.category ?? "unknown",
      type: definition.evidence[id]?.type ?? "unknown",
    });
    const unrequestedIds = state.evidence_available.filter(
      (id) => !requested.has(id) && definition.evidence[id] !== undefined,
    );

    const isAction = event.eventType === "action";
    const actionIdRaw = event.payload["actionId"];
    const evidenceIdRaw = event.payload["evidenceId"];
    const actionId = isAction && typeof actionIdRaw === "string" ? actionIdRaw : null;
    const evidenceId = !isAction && typeof evidenceIdRaw === "string" ? evidenceIdRaw : null;

    const alternatives: ReplayAlternative[] = isAction
      ? actionAlternatives(state, actionId, definition)
      : unrequestedIds
          .filter((id) => id !== evidenceId)
          .map((id) => {
            const item = definition.evidence[id] as ScenarioDefinition["evidence"][string];
            return {
              kind: "evidence" as const,
              id,
              label: id,
              description: clip(
                `Requesting ${item.type} evidence "${id}" instead costs ${item.time_cost} simulated minute(s) and reveals ${item.category} information.`,
              ),
            };
          });

    return {
      sessionId: session.id,
      step,
      totalSteps: decisions.length,
      sequencePos: event.sequencePos,
      eventType: event.eventType as "action" | "evidence_request",
      simTime: event.simTime,
      actionId,
      evidenceId,
      state,
      revealedEvidence: [...revealed].map(evidenceRef),
      unrequestedEvidence: unrequestedIds.map(evidenceRef),
      alternatives,
      noAlternativesNote:
        alternatives.length === 0
          ? "No alternative decision was defined for the state at this step."
          : null,
    };
  }
}

/** State before the decision: stored in the action payload, else the event snapshot. */
function stateBefore(event: SessionEvent): ScenarioState {
  const before = event.payload["stateBefore"];
  const candidate = typeof before === "object" && before !== null ? before : event.stateSnapshot;
  return structuredClone(candidate as ScenarioState);
}

function clip(text: string): string {
  return text.length <= MAX_ALTERNATIVE_DESCRIPTION_LENGTH
    ? text
    : `${text.slice(0, MAX_ALTERNATIVE_DESCRIPTION_LENGTH - 1)}…`;
}

/** Other actions whose preconditions held in `state`, explained via pure applyTransition. */
function actionAlternatives(
  state: ScenarioState,
  takenId: string | null,
  definition: ScenarioDefinition,
): ReplayAlternative[] {
  const result: ReplayAlternative[] = [];
  for (const action of Object.values(definition.actions)) {
    if (action.id === takenId) continue;
    const outcome = applyTransition(state, action, definition);
    if ("error" in outcome) continue;
    const next = outcome.nextState;
    const stateNote =
      next.id === state.id ? "stays in the same state" : `moves to state "${next.id}"`;
    const impactNote =
      next.customer_impact !== state.customer_impact
        ? `customer impact becomes "${next.customer_impact}"`
        : "customer impact is unchanged";
    const reversibility = action.reversible ? "reversible" : "irreversible";
    result.push({
      kind: "action",
      id: action.id,
      label: action.label,
      description: clip(
        `Choosing "${action.label}" (${reversibility}, ${action.time_cost} min) ${stateNote}; ${impactNote}.`,
      ),
    });
  }
  return result;
}

export function createScoringService(options: ScoringServiceOptions): ScoringService {
  return new ScoringService(options);
}

// ─── Scoring (pure, deterministic, journal facts only) ────────────────────────

interface Scored {
  scores: DimensionScores;
  feedback: DimensionFeedback;
  terminal: TerminalStateMapping | null;
}

/** Scores the six dimensions from the journal; no I/O, no randomness. */
export function scoreSession(
  session: SessionRecord,
  scenario: ScenarioContentFile,
  events: readonly SessionEvent[],
  rubric: RubricDefinition,
): Scored {
  const { definition } = scenario;
  const max = rubric.maxScore;
  const fraction = (value: number): number => round2(max * clamp01(value));

  const actionEvents = events.filter((e) => e.eventType === "action");
  const availableEvidence = events.filter(
    (e) => e.eventType === "evidence_request" && e.payload["status"] === "available",
  );
  const actionOf = (e: SessionEvent): ScenarioAction | undefined => {
    const id = e.payload["actionId"];
    return typeof id === "string" ? definition.actions[id] : undefined;
  };
  const evidenceBefore = (e: SessionEvent): number =>
    availableEvidence.filter((ev) => ev.sequencePos < e.sequencePos).length;

  // Impact Control: remaining fraction of the time limit.
  const limit = scenario.time_limit_min ?? scenario.est_duration_min;
  const impactFraction =
    session.status === "timed_out" || limit <= 0 ? 0 : 1 - session.simTimeElapsed / limit;

  // Diagnostic Quality: evidence gathered before the first mitigating action.
  const firstMitigation = actionEvents.find((e) => (actionOf(e)?.effects.length ?? 0) > 0);
  const required = Math.max(1, rubric.criteria.diagnosticQuality.minEvidenceBeforeMitigation);
  let diagnosticFraction: number;
  let diagnosticNote: string;
  if (firstMitigation !== undefined) {
    const n = evidenceBefore(firstMitigation);
    diagnosticFraction = n / required;
    diagnosticNote = `${n} evidence request(s) before the first mitigating action (${required} expected).`;
  } else {
    const total = Object.keys(definition.evidence).length;
    const unique = new Set(availableEvidence.map((e) => e.payload["evidenceId"])).size;
    diagnosticFraction = total === 0 ? 0 : unique / total;
    diagnosticNote = `No mitigating action taken; ${unique} of ${total} evidence item(s) examined.`;
  }

  // Risk Management: irreversible actions without prior evidence are penalised.
  const irreversible = actionEvents.filter((e) => actionOf(e)?.reversible === false);
  const unsafe = irreversible.filter((e) => evidenceBefore(e) === 0).length;
  const riskFraction = irreversible.length === 0 ? 1 : 1 - unsafe / irreversible.length;
  const riskNote =
    irreversible.length === 0
      ? "No irreversible actions were taken."
      : `${unsafe} of ${irreversible.length} irreversible action(s) taken without prior evidence.`;

  // Recovery Quality: final state terminal, weighted by terminal mapping.
  const finalSnapshot = events.length > 0 ? events[events.length - 1]?.stateSnapshot : undefined;
  const reachedTerminal = finalSnapshot?.is_terminal === true;
  const mapping =
    reachedTerminal && finalSnapshot !== undefined
      ? (rubric.terminalStates[finalSnapshot.id] ?? null)
      : null;
  const recoveryFraction = !reachedTerminal
    ? 0
    : (mapping?.recoveryFraction ?? rubric.criteria.recoveryQuality.unmappedTerminalFraction);
  const recoveryNote = reachedTerminal
    ? `Session ended in terminal state "${finalSnapshot?.id ?? ""}".`
    : "Session ended without reaching a terminal state.";

  // Communication: declare/notify-type actions that carry a rationale.
  const keywords = rubric.criteria.communication.actionKeywords.map((k) => k.toLowerCase());
  const communications = actionEvents.filter((e) => {
    const action = actionOf(e);
    const rationale = e.payload["rationale"];
    if (action === undefined || typeof rationale !== "string" || rationale.trim() === "") {
      return false;
    }
    const haystack = `${action.id} ${action.label}`.toLowerCase();
    return keywords.some((k) => haystack.includes(k));
  });
  const communicationFraction = communications.length > 0 ? 1 : 0;
  const communicationNote = `${communications.length} communication action(s) with a rationale.`;

  // Learning/Reflection: rationales chosen from the offered options.
  const grounded = actionEvents.filter((e) => {
    const rationale = e.payload["rationale"];
    return typeof rationale === "string" && actionOf(e)?.rationale_options.includes(rationale);
  }).length;
  const learningFraction = actionEvents.length === 0 ? 0 : grounded / actionEvents.length;

  return {
    scores: {
      impactControl: fraction(impactFraction),
      diagnosticQuality: fraction(diagnosticFraction),
      riskManagement: fraction(riskFraction),
      recoveryQuality: fraction(recoveryFraction),
      communication: fraction(communicationFraction),
      learningReflection: fraction(learningFraction),
    },
    feedback: {
      impactControl: `${session.simTimeElapsed} of ${limit} simulated minutes used.`,
      diagnosticQuality: diagnosticNote,
      riskManagement: riskNote,
      recoveryQuality: recoveryNote,
      communication: communicationNote,
      learningReflection: `${grounded} of ${actionEvents.length} action rationale(s) selected from the offered options.`,
    },
    terminal: mapping,
  };
}

function toDebriefResult(
  session: SessionRecord,
  scenario: ScenarioContentFile,
  rubric: RubricDefinition,
  record: AssessmentRecord,
): DebriefResult {
  const { terminalOutcome, terminalDebrief, ...feedback } = record.feedback;
  return {
    sessionId: session.id,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    rubricVersion: record.rubricVersion,
    sessionStatus: session.status,
    incidentSlug: scenario.incident_slug,
    maxScore: rubric.maxScore,
    scores: {
      impactControl: record.impactControl,
      diagnosticQuality: record.diagnosticQuality,
      riskManagement: record.riskManagement,
      recoveryQuality: record.recoveryQuality,
      communication: record.communication,
      learningReflection: record.learningReflection,
    },
    labels: { ...DIMENSION_LABELS },
    feedback,
    terminalOutcome,
    terminalDebrief,
    endedAt: session.endedAt ?? session.startedAt,
    computedAt: record.computedAt,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
