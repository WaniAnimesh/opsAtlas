import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeLearningView } from "./learning";
import type { LearningInput, Trend } from "./learning";
import { SCORE_DIMENSION_KEYS } from "./session-client";
import type { DebriefResult, ScoreDimensionKey, SessionStatus } from "./session-client";

const SCENARIOS = ["alpha", "beta", "gamma"] as const;
const TAGS: Record<string, string[]> = {
  alpha: ["triage", "comms"],
  beta: ["triage"],
  gamma: [],
};
const STATUSES: SessionStatus[] = ["completed", "timed_out", "abandoned"];
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789-_".split("");

const startedAtMs = fc.integer({ min: Date.UTC(2024, 0, 1), max: Date.UTC(2026, 0, 1) });

const lookup = (scenarioId: string, maxScore: number) =>
  fc.oneof(
    fc.constant<LearningInput["result"]>({ status: "unavailable" }),
    fc
      .record({
        status: fc.constantFrom(...STATUSES),
        scores: fc.tuple(...SCORE_DIMENSION_KEYS.map(() => fc.integer({ min: 0, max: maxScore }))),
        endedMs: startedAtMs,
      })
      .map(({ status, scores, endedMs }): LearningInput["result"] => {
        const s = Object.fromEntries(SCORE_DIMENSION_KEYS.map((k, i) => [k, scores[i]])) as Record<
          ScoreDimensionKey,
          number
        >;
        return {
          status: "ok",
          debrief: {
            sessionId: "x",
            scenarioId,
            scenarioVersion: "1.0.0",
            sessionStatus: status,
            endedAt: new Date(endedMs).toISOString(),
            incidentSlug: "i",
            maxScore,
            scores: s,
          } as unknown as DebriefResult,
        };
      }),
  );

const input: fc.Arbitrary<LearningInput> = fc
  .record({
    key: fc.array(fc.constantFrom(...ALPHABET), { minLength: 43, maxLength: 43 }).map((c) => c.join("")),
    scenarioId: fc.constantFrom(...SCENARIOS),
    ms: startedAtMs,
    maxScore: fc.integer({ min: 1, max: 100 }),
  })
  .chain(({ key, scenarioId, ms, maxScore }) =>
    lookup(scenarioId, maxScore).map(
      (result): LearningInput => ({
        entry: {
          sessionKey: key,
          scenarioId,
          scenarioTitle: `Title ${scenarioId}`,
          startedAt: new Date(ms).toISOString(),
        },
        result,
        skillTags: TAGS[scenarioId] ?? [],
      }),
    ),
  );

const inputs = fc.uniqueArray(input, { maxLength: 25, selector: (i) => i.entry.sessionKey });

const isCompleted = (i: LearningInput): boolean =>
  i.result.status === "ok" &&
  (i.result.debrief.sessionStatus === "completed" || i.result.debrief.sessionStatus === "timed_out");

const cmp = (a: number, b: number): Trend => {
  const x = Math.round(a * 100) / 100;
  const y = Math.round(b * 100) / 100;
  return x > y ? "up" : x < y ? "down" : "unchanged";
};

// Feature: opsatlas-platform, Property 15: Client-Side Learning Calculations
describe("Property 15: Client-Side Learning Calculations", () => {
  it("history is newest first and contains every entry", () => {
    fc.assert(
      fc.property(inputs, (list) => {
        const { history } = computeLearningView(list);
        expect(history).toHaveLength(list.length);
        expect(new Set(history.map((h) => h.sessionKey))).toEqual(
          new Set(list.map((i) => i.entry.sessionKey)),
        );
        for (let i = 1; i < history.length; i++) {
          expect(Date.parse(history[i - 1]!.startedAt)).toBeGreaterThanOrEqual(
            Date.parse(history[i]!.startedAt),
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  it("proficiency lies within [1, 5] and the skill map is empty without completed sessions", () => {
    fc.assert(
      fc.property(inputs, (list) => {
        const { skillMap } = computeLearningView(list);
        for (const s of skillMap) {
          expect(s.proficiency).toBeGreaterThanOrEqual(1);
          expect(s.proficiency).toBeLessThanOrEqual(5);
          expect(s.evidenceCount).toBeGreaterThan(0);
        }
        if (!list.some(isCompleted)) expect(skillMap).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("trends compare the latest and the preceding completed attempt of the same scenario", () => {
    fc.assert(
      fc.property(inputs, (list) => {
        const { scenarioTrends } = computeLearningView(list);
        for (const id of SCENARIOS) {
          const done = list
            .filter((i) => i.entry.scenarioId === id && isCompleted(i))
            .sort((a, b) => {
              const d = Date.parse(b.entry.startedAt) - Date.parse(a.entry.startedAt);
              return d !== 0 ? d : a.entry.sessionKey < b.entry.sessionKey ? -1 : 1;
            });
          const trend = scenarioTrends.find((t) => t.scenarioId === id);
          if (done.length < 2) {
            expect(trend).toBeUndefined();
            continue;
          }
          const [latest, prev] = done.map((d) => (d.result.status === "ok" ? d.result.debrief : null));
          expect(trend?.attempts).toBe(done.length);
          for (const k of SCORE_DIMENSION_KEYS) {
            expect(trend?.trends[k]).toBe(cmp(latest!.scores[k], prev!.scores[k]));
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("removing unavailable or abandoned sessions changes only the history rows", () => {
    fc.assert(
      fc.property(inputs, (list) => {
        const kept = list.filter(isCompleted);
        const full = computeLearningView(list);
        const reduced = computeLearningView(kept);
        expect(full.skillMap).toEqual(reduced.skillMap);
        expect(full.scenarioTrends).toEqual(reduced.scenarioTrends);
        const keptKeys = new Set(kept.map((i) => i.entry.sessionKey));
        expect(full.history.filter((h) => keptKeys.has(h.sessionKey))).toEqual(reduced.history);
      }),
      { numRuns: 100 },
    );
  });
});

describe("computeLearningView examples", () => {
  const key = (n: number): string => String(n).padStart(43, "k");
  const make = (
    n: number,
    status: SessionStatus,
    score: number,
    day: number,
  ): LearningInput => ({
    entry: {
      sessionKey: key(n),
      scenarioId: "alpha",
      scenarioTitle: "Alpha",
      startedAt: new Date(Date.UTC(2025, 0, day)).toISOString(),
    },
    skillTags: ["triage"],
    result: {
      status: "ok",
      debrief: {
        sessionStatus: status,
        endedAt: new Date(Date.UTC(2025, 0, day, 12)).toISOString(),
        maxScore: 10,
        scores: Object.fromEntries(SCORE_DIMENSION_KEYS.map((k) => [k, score])),
      } as unknown as DebriefResult,
    },
  });

  it("counts timed_out as completed, needs two attempts for a trend, and maps 10/10 to 5", () => {
    const one = computeLearningView([make(1, "timed_out", 10, 1)]);
    expect(one.skillMap).toEqual([{ skillTag: "triage", proficiency: 5, evidenceCount: 1 }]);
    expect(one.scenarioTrends).toEqual([]);
    expect(one.history[0]?.completionDate).toBe("2025-01-01");

    const two = computeLearningView([make(1, "completed", 4, 1), make(2, "timed_out", 6, 2)]);
    expect(two.scenarioTrends[0]?.trends.communication).toBe("up");
    expect(two.skillMap[0]?.proficiency).toBe(3);
  });
});
