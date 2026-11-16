import { apiUrl } from "./api";

export type ScenarioDifficulty = "beginner" | "intermediate" | "advanced";

export interface ScenarioSummary {
  id: string;
  incident_slug: string;
  title: string;
  objective: string;
  difficulty: ScenarioDifficulty;
  est_duration_min: number;
  skill_tags: string[];
  version: string;
}

export const MAX_OBJECTIVE_LENGTH = 160;
export const MAX_SKILL_TAGS = 10;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Truncate text to at most `max` characters, ending with an ellipsis when cut. */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}\u2026`;
}

/** Validate one API entry; returns null when malformed. */
export function parseScenarioSummary(value: unknown): ScenarioSummary | null {
  if (!isRecord(value)) return null;
  const { id, incident_slug, title, objective, difficulty, est_duration_min, skill_tags, version } =
    value;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) return null;
  if (typeof title !== "string" || title.length === 0) return null;
  if (typeof objective !== "string") return null;
  if (difficulty !== "beginner" && difficulty !== "intermediate" && difficulty !== "advanced") {
    return null;
  }
  if (typeof est_duration_min !== "number" || !Number.isFinite(est_duration_min)) return null;
  if (!Array.isArray(skill_tags)) return null;
  return {
    id,
    incident_slug: typeof incident_slug === "string" ? incident_slug : "",
    title,
    objective: truncateText(objective, MAX_OBJECTIVE_LENGTH),
    difficulty,
    est_duration_min,
    skill_tags: skill_tags
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .slice(0, MAX_SKILL_TAGS),
    version: typeof version === "string" ? version : "",
  };
}

/** Parse an API payload, silently dropping malformed entries. */
export function parseScenarioList(payload: unknown): ScenarioSummary[] {
  if (!Array.isArray(payload)) throw new Error("Unexpected response from the scenarios API.");
  return payload
    .map(parseScenarioSummary)
    .filter((s): s is ScenarioSummary => s !== null);
}

/** Fetch published scenarios from GET /api/v1/scenarios. */
export async function fetchScenarios(signal?: AbortSignal): Promise<ScenarioSummary[]> {
  const init: RequestInit = { headers: { Accept: "application/json" } };
  if (signal) init.signal = signal;
  const response = await fetch(apiUrl("/api/v1/scenarios"), init);
  if (!response.ok) {
    throw new Error(`Scenarios request failed (${response.status}).`);
  }
  return parseScenarioList(await response.json());
}
