"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { computeLearningView } from "../../lib/learning";
import type { DebriefLookup, LearningInput, LearningView as View, Trend } from "../../lib/learning";
import { clearProgress, getBrowserStore, readProgress } from "../../lib/local-progress";
import type { LocalProgressEntry, ProgressStore } from "../../lib/local-progress";
import { ApiRequestError, SCORE_DIMENSION_KEYS, fetchDebrief } from "../../lib/session-client";
import type { ScoreDimensionKey } from "../../lib/session-client";

const CONCURRENCY = 4;
const NO_TAGS: Record<string, string[]> = {};

const DIMENSION_LABELS: Record<ScoreDimensionKey, string> = {
  impactControl: "Impact Control",
  diagnosticQuality: "Diagnostic Quality",
  riskManagement: "Risk Management",
  recoveryQuality: "Recovery Quality",
  communication: "Communication",
  learningReflection: "Learning/Reflection",
};

const TREND_TEXT: Record<Trend, { text: string; icon: string }> = {
  up: { text: "up", icon: "\u25B2" },
  down: { text: "down", icon: "\u25BC" },
  unchanged: { text: "unchanged", icon: "\u25A0" },
};

const btn =
  "rounded border border-border px-3 py-1 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** A ProgressStore that may report it fell back to memory (BrowserProgressStore). */
type LearningStore = ProgressStore & { readonly degraded?: boolean };

type State =
  | { kind: "loading" }
  | { kind: "ready"; view: View; count: number };

async function lookup(key: string): Promise<DebriefLookup> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { status: "ok", debrief: await fetchDebrief(key) };
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.status === 404) return { status: "unavailable" };
        if (err.status === 409) return { status: "unavailable", reason: "in_progress" };
      }
    }
  }
  return { status: "unavailable" };
}

/** Runs `worker` over `items` with at most `limit` in flight; preserves order. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const run = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function LearningView({
  skillTagsByScenario = NO_TAGS,
  store,
}: {
  skillTagsByScenario?: Record<string, string[]>;
  store?: LearningStore;
}): ReactNode {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    const s: LearningStore = store ?? getBrowserStore();
    let cancelled = false;
    const entries: LocalProgressEntry[] = readProgress(s);
    void Promise.resolve().then(() => !cancelled && setDegraded(s.degraded === true));
    void mapLimit(entries, CONCURRENCY, async (entry): Promise<LearningInput> => ({
      entry,
      result: await lookup(entry.sessionKey),
      skillTags: skillTagsByScenario[entry.scenarioId] ?? [],
    })).then((inputs) => {
      if (!cancelled) {
        setState({ kind: "ready", view: computeLearningView(inputs), count: entries.length });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [skillTagsByScenario, store]);

  const onClear = useCallback((): void => {
    const s: LearningStore = store ?? getBrowserStore();
    clearProgress(s);
    setState({ kind: "ready", view: computeLearningView([]), count: 0 });
  }, [store]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Learning</h1>
      <p className="mt-2 text-muted">
        Your history is stored only on this device, in this browser. It is not sent to OpsAtlas and
        will not appear on other devices or browsers.
      </p>
      {degraded ? (
        <p role="alert" className="mt-2">
          Your browser blocks local storage, so progress cannot be saved. It will be lost when you
          close this tab.
        </p>
      ) : null}
      <Body state={state} onClear={onClear} />
    </div>
  );
}

function Body({ state, onClear }: { state: State; onClear: () => void }): ReactNode {
  if (state.kind === "loading") return <p role="status">Loading your learning data…</p>;
  const { view } = state;
  if (state.count === 0) {
    return (
      <p className="mt-6">
        You have no sessions on this device yet. Complete a simulator scenario to build your
        history, skill map and trends.
      </p>
    );
  }
  return (
    <>
      <p className="mt-4">
        <button type="button" className={btn} onClick={onClear}>
          Clear my progress
        </button>
      </p>
      <section aria-labelledby="history-h" className="mt-6">
        <h2 id="history-h" className="text-xl font-semibold">
          History
        </h2>
        <ol aria-label="Sessions, newest first" className="m-0 list-none space-y-4 p-0">
          {view.history.map((h) => (
            <li key={h.sessionKey} className="border border-border p-3">
              <h3 className="font-semibold">{h.scenarioTitle}</h3>
              {h.scores === null ? (
                <p className="text-sm text-muted">
                  {h.inProgress
                    ? "In progress or not yet debriefed."
                    : "This session is no longer available."}
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted">
                    {h.sessionStatus === "abandoned" ? "Abandoned" : "Completed"}
                    {h.completionDate !== null ? (
                      <>
                        : <time dateTime={h.completionDate}>{h.completionDate}</time>
                      </>
                    ) : null}
                  </p>
                  <ul className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2">
                    {SCORE_DIMENSION_KEYS.map((key) => (
                      <li key={key}>
                        {DIMENSION_LABELS[key]}: <span>{h.scores?.[key]}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </li>
          ))}
        </ol>
      </section>
      {view.skillMap.length > 0 && (
        <section aria-labelledby="skills-h" className="mt-8">
          <h2 id="skills-h" className="text-xl font-semibold">
            Skill map
          </h2>
          <ul className="m-0 list-none space-y-3 p-0">
            {view.skillMap.map((s) => {
              const id = `skill-${s.skillTag}`;
              return (
                <li key={s.skillTag}>
                  <span id={id}>{s.skillTag}</span>: <span>{s.proficiency.toFixed(1)} / 5</span>{" "}
                  <span className="text-sm text-muted">
                    ({s.evidenceCount} {s.evidenceCount === 1 ? "session" : "sessions"})
                  </span>
                  <div
                    role="meter"
                    aria-labelledby={id}
                    aria-valuemin={1}
                    aria-valuemax={5}
                    aria-valuenow={s.proficiency}
                    aria-valuetext={`${s.proficiency.toFixed(1)} out of 5`}
                    className="h-2 w-full max-w-xs border border-border"
                  >
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${((s.proficiency - 1) / 4) * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {view.scenarioTrends.length > 0 && (
        <section aria-labelledby="trends-h" className="mt-8">
          <h2 id="trends-h" className="text-xl font-semibold">
            Trends
          </h2>
          <ul className="m-0 list-none space-y-4 p-0">
            {view.scenarioTrends.map((t) => (
              <li key={t.scenarioId}>
                <h3 className="font-semibold">
                  {t.scenarioTitle} ({t.attempts} completions)
                </h3>
                <ul className="m-0 list-none p-0">
                  {SCORE_DIMENSION_KEYS.map((key) => (
                    <li key={key}>
                      {DIMENSION_LABELS[key]}:{" "}
                      <span aria-hidden="true">{TREND_TEXT[t.trends[key]].icon} </span>
                      <span>{TREND_TEXT[t.trends[key]].text}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
