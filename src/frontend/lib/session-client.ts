import { apiUrl } from "./api";

/** Scenario brief as returned by GET /api/v1/scenarios/:id/brief. */
export interface ScenarioBrief {
  id: string;
  title: string;
  objective: string;
  difficulty: string;
  est_duration_min: number;
  skill_tags: string[];
  version?: string;
}

/** Error carrying the HTTP status and API-provided message. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

async function errorFrom(res: Response, fallback: string): Promise<ApiRequestError> {
  let message = fallback;
  let code: string | undefined;
  try {
    const data = (await res.json()) as { error?: { message?: unknown; code?: unknown } };
    if (typeof data.error?.message === "string") message = data.error.message;
    if (typeof data.error?.code === "string") code = data.error.code;
  } catch {
    // keep fallback
  }
  return new ApiRequestError(res.status, message, code);
}

/** Fetch a scenario brief (public endpoint). */
export async function fetchScenarioBrief(id: string): Promise<ScenarioBrief> {
  const res = await fetch(apiUrl(`/api/v1/scenarios/${encodeURIComponent(id)}/brief`));
  if (!res.ok) throw await errorFrom(res, "Failed to load the scenario.");
  return (await res.json()) as ScenarioBrief;
}

/**
 * Create a session for a scenario. Pass `scenarioVersion` to pin a specific
 * published version (used by debrief retry). The returned `sessionId` is the Session_Key.
 */
export async function createSession(
  scenarioId: string,
  scenarioVersion?: string,
): Promise<{ sessionId: string }> {
  const res = await fetch(apiUrl("/api/v1/sessions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      scenarioVersion === undefined ? { scenarioId } : { scenarioId, scenarioVersion },
    ),
  });
  if (!res.ok) throw await errorFrom(res, "Failed to start the session.");
  return (await res.json()) as { sessionId: string };
}

/* ---------------------------- Simulator run API ---------------------------- */

export type SessionStatus = "active" | "paused" | "completed" | "abandoned" | "timed_out";

export interface RunScenarioState {
  id: string;
  is_terminal: boolean;
  service_health: Record<string, string>;
  metrics: Record<string, number>;
  dependencies: Record<string, string>;
  customer_impact: string;
  evidence_available: string[];
  active_alerts: string[];
}

/** GET /api/v1/sessions/:id (fields used by the run page). */
export interface RunSession {
  id: string;
  status: SessionStatus;
  simTimeElapsed: number;
  state: RunScenarioState;
}

export interface ActionOption {
  id: string;
  label: string;
  time_cost: number;
  reversible: boolean;
  rationale_options: string[];
  available: boolean;
  unmetPreconditions: string[];
  modifiedAttributes?: string[];
}

export interface EvidenceOption {
  id: string;
  type: string;
  category: string;
  time_cost: number;
  requested: boolean;
}

/** GET /api/v1/sessions/:id/options. */
export interface SessionOptions {
  sessionId: string;
  status: SessionStatus;
  stateId: string;
  actions: ActionOption[];
  evidence: EvidenceOption[];
}

export interface EvidenceResponse {
  evidenceId: string;
  status: "available" | "unavailable";
  payload?: unknown;
}

async function sessionRequest<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<T> {
  const res = await fetch(apiUrl(`/api/v1/sessions/${path}`), {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw await errorFrom(res, "The request failed.");
  return (await res.json()) as T;
}

const seg = encodeURIComponent;

export const fetchRunSession = (id: string): Promise<RunSession> =>
  sessionRequest(seg(id), "GET");

export const fetchSessionOptions = (id: string): Promise<SessionOptions> =>
  sessionRequest(`${seg(id)}/options`, "GET");

export const submitAction = (
  id: string,
  actionId: string,
  rationale: string,
): Promise<unknown> => sessionRequest(`${seg(id)}/actions`, "POST", { actionId, rationale });

export const requestEvidence = (
  id: string,
  evidenceId: string,
): Promise<EvidenceResponse> =>
  sessionRequest(`${seg(id)}/evidence`, "POST", { evidenceId });

export const pauseRunSession = (id: string): Promise<unknown> =>
  sessionRequest(`${seg(id)}/pause`, "POST");

export const resumeRunSession = (id: string): Promise<unknown> =>
  sessionRequest(`${seg(id)}/resume`, "POST");

export const abandonRunSession = (id: string): Promise<unknown> =>
  sessionRequest(`${seg(id)}/abandon`, "POST");

/* ------------------------------ Debrief API ------------------------------- */

export const SCORE_DIMENSION_KEYS = [
  "impactControl",
  "diagnosticQuality",
  "riskManagement",
  "recoveryQuality",
  "communication",
  "learningReflection",
] as const;
export type ScoreDimensionKey = (typeof SCORE_DIMENSION_KEYS)[number];

/** GET /api/v1/sessions/:id/debrief. No composite score exists. */
export interface DebriefResult {
  sessionId: string;
  scenarioId: string;
  scenarioVersion: string;
  sessionStatus: SessionStatus;
  endedAt: string;
  incidentSlug: string;
  maxScore: number;
  scores: Record<ScoreDimensionKey, number>;
  labels: Record<ScoreDimensionKey, string>;
  feedback: Record<ScoreDimensionKey, string>;
  terminalOutcome: string | null;
  terminalDebrief: string | null;
}

export interface ReplayEvidenceRef {
  evidenceId: string;
  category: string;
  type: string;
}

export interface ReplayAlternative {
  kind: "action" | "evidence";
  id: string;
  label: string;
  description: string;
}

/** GET /api/v1/sessions/:id/debrief/steps/:step. */
export interface ReplayStep {
  step: number;
  totalSteps: number;
  sequencePos: number;
  eventType: "action" | "evidence_request";
  simTime: number;
  actionId: string | null;
  evidenceId: string | null;
  state: RunScenarioState;
  revealedEvidence: ReplayEvidenceRef[];
  unrequestedEvidence: ReplayEvidenceRef[];
  alternatives: ReplayAlternative[];
  noAlternativesNote: string | null;
}

export const fetchDebrief = (id: string): Promise<DebriefResult> =>
  sessionRequest(`${seg(id)}/debrief`, "GET");

export const fetchReplayStep = (id: string, step: number): Promise<ReplayStep> =>
  sessionRequest(`${seg(id)}/debrief/steps/${step}`, "GET");
