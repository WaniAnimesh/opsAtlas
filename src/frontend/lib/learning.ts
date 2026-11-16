/**
 * Pure learning calculations for /learning, ported from the removed server-side
 * identity-learning module. It takes the data (Local_Progress entries plus each
 * session's debrief) instead of reading a user-scoped repository.
 */
import type { LocalProgressEntry } from "./local-progress";
import { SCORE_DIMENSION_KEYS } from "./session-client";
import type { DebriefResult, ScoreDimensionKey, SessionStatus } from "./session-client";

export type Trend = "up" | "down" | "unchanged";

/**
 * "unavailable": 404, purged, or network error after retry.
 * `reason: "in_progress"` marks a session that has not concluded yet (409).
 */
export type DebriefLookup =
  | { status: "ok"; debrief: DebriefResult }
  | { status: "unavailable"; reason?: "in_progress" };

export interface LearningInput {
  entry: LocalProgressEntry;
  result: DebriefLookup;
  /** From the build-time scenario catalog, by scenarioId. */
  skillTags: string[];
}

export interface HistoryEntry {
  sessionKey: string;
  scenarioId: string;
  scenarioTitle: string;
  startedAt: string;
  /** True when the debrief could not be fetched ("no longer available"). */
  unavailable: boolean;
  /** True when the session has not concluded; implies `unavailable`. */
  inProgress: boolean;
  sessionStatus: SessionStatus | null;
  /** endedAt as YYYY-MM-DD (UTC); null when unavailable. */
  completionDate: string | null;
  /** Six dimension scores; null when unavailable. */
  scores: Record<ScoreDimensionKey, number> | null;
  maxScore: number | null;
}

export interface SkillMapEntry {
  skillTag: string;
  /** 1 to 5, one decimal. */
  proficiency: number;
  evidenceCount: number;
}

export interface ScenarioTrend {
  scenarioId: string;
  scenarioTitle: string;
  attempts: number;
  trends: Record<ScoreDimensionKey, Trend>;
}

export interface LearningView {
  history: HistoryEntry[];
  skillMap: SkillMapEntry[];
  scenarioTrends: ScenarioTrend[];
}

export const MIN_PROFICIENCY = 1;
export const MAX_PROFICIENCY = 5;

export function isCompletedStatus(status: SessionStatus): boolean {
  return status === "completed" || status === "timed_out";
}

const round = (n: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

function compareInputs(a: LearningInput, b: LearningInput): number {
  const diff = Date.parse(b.entry.startedAt) - Date.parse(a.entry.startedAt);
  if (diff !== 0) return diff;
  return a.entry.sessionKey < b.entry.sessionKey ? -1 : a.entry.sessionKey > b.entry.sessionKey ? 1 : 0;
}

function formatDate(iso: string): string | null {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** Mean of the six dimension scores as a fraction of maxScore. */
function meanRatio(d: DebriefResult): number {
  if (!(d.maxScore > 0)) return 0;
  const sum = SCORE_DIMENSION_KEYS.reduce((acc, k) => acc + (d.scores[k] ?? 0), 0);
  return sum / SCORE_DIMENSION_KEYS.length / d.maxScore;
}

export function proficiencyFromRatio(ratio: number): number {
  const raw = MIN_PROFICIENCY + (MAX_PROFICIENCY - MIN_PROFICIENCY) * ratio;
  return round(Math.min(MAX_PROFICIENCY, Math.max(MIN_PROFICIENCY, raw)), 1);
}

function compareScore(latest: number, previous: number): Trend {
  const a = round(latest, 2);
  const b = round(previous, 2);
  return a > b ? "up" : a < b ? "down" : "unchanged";
}

interface Completed {
  input: LearningInput;
  debrief: DebriefResult;
}

export function computeLearningView(inputs: readonly LearningInput[]): LearningView {
  const sorted = [...inputs].sort(compareInputs);

  const history: HistoryEntry[] = sorted.map(({ entry, result }) => {
    const base = {
      sessionKey: entry.sessionKey,
      scenarioId: entry.scenarioId,
      scenarioTitle: entry.scenarioTitle,
      startedAt: entry.startedAt,
    };
    if (result.status !== "ok") {
      return {
        ...base,
        unavailable: true,
        inProgress: result.reason === "in_progress",
        sessionStatus: null,
        completionDate: null,
        scores: null,
        maxScore: null,
      };
    }
    const d = result.debrief;
    return {
      ...base,
      unavailable: false,
      inProgress: false,
      sessionStatus: d.sessionStatus,
      completionDate: formatDate(d.endedAt),
      scores: { ...d.scores },
      maxScore: d.maxScore,
    };
  });

  const completed: Completed[] = [];
  for (const input of sorted) {
    if (input.result.status === "ok" && isCompletedStatus(input.result.debrief.sessionStatus)) {
      completed.push({ input, debrief: input.result.debrief });
    }
  }

  // Skill map: per tag, mean of per-session ratios over completed sessions carrying the tag.
  const byTag = new Map<string, number[]>();
  for (const { input, debrief } of completed) {
    const ratio = meanRatio(debrief);
    for (const tag of new Set(input.skillTags)) {
      const list = byTag.get(tag) ?? [];
      list.push(ratio);
      byTag.set(tag, list);
    }
  }
  const skillMap: SkillMapEntry[] = [...byTag.entries()]
    .map(([skillTag, ratios]) => ({
      skillTag,
      proficiency: proficiencyFromRatio(ratios.reduce((a, b) => a + b, 0) / ratios.length),
      evidenceCount: ratios.length,
    }))
    .sort((a, b) => (a.skillTag < b.skillTag ? -1 : a.skillTag > b.skillTag ? 1 : 0));

  // Trends: only scenarios with >= 2 completed attempts. `completed` is newest first.
  const byScenario = new Map<string, Completed[]>();
  for (const c of completed) {
    const list = byScenario.get(c.input.entry.scenarioId) ?? [];
    list.push(c);
    byScenario.set(c.input.entry.scenarioId, list);
  }
  const scenarioTrends: ScenarioTrend[] = [];
  for (const [scenarioId, attempts] of byScenario) {
    const latest = attempts[0];
    const previous = attempts[1];
    if (latest === undefined || previous === undefined) continue;
    const trends = Object.fromEntries(
      SCORE_DIMENSION_KEYS.map((k) => [
        k,
        compareScore(latest.debrief.scores[k], previous.debrief.scores[k]),
      ]),
    ) as Record<ScoreDimensionKey, Trend>;
    scenarioTrends.push({
      scenarioId,
      scenarioTitle: latest.input.entry.scenarioTitle,
      attempts: attempts.length,
      trends,
    });
  }
  scenarioTrends.sort((a, b) => (a.scenarioId < b.scenarioId ? -1 : a.scenarioId > b.scenarioId ? 1 : 0));

  return { history, skillMap, scenarioTrends };
}
