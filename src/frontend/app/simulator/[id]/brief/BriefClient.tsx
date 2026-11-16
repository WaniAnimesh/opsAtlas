"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { addProgress, getBrowserStore } from "../../../../lib/local-progress";
import {
  ApiRequestError,
  createSession,
  fetchScenarioBrief,
  type ScenarioBrief,
} from "../../../../lib/session-client";

type LoadState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "ready"; brief: ScenarioBrief };

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function BriefClient({ scenarioId }: { scenarioId: string }): ReactNode {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchScenarioBrief(scenarioId).then(
      (brief) => !cancelled && setState({ kind: "ready", brief }),
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.status === 404) {
          setState({ kind: "not-found" });
        } else {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Failed to load the scenario.",
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [scenarioId]);

  async function onStart(title: string): Promise<void> {
    setStartError(null);
    setStarting(true);
    try {
      const { sessionId } = await createSession(scenarioId);
      try {
        addProgress(getBrowserStore(), {
          sessionKey: sessionId,
          scenarioId,
          scenarioTitle: title,
          startedAt: new Date().toISOString(),
        });
      } catch {
        // History is best-effort and must not block the session.
      }
      router.push(
        `/simulator/${encodeURIComponent(scenarioId)}/run/?session=${encodeURIComponent(sessionId)}`,
      );
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Failed to start the session.");
      setStarting(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <p role="status" aria-live="polite">
        Loading scenario…
      </p>
    );
  }

  if (state.kind === "not-found") {
    return (
      <div role="alert">
        <h1 className="text-2xl font-semibold">Scenario not found</h1>
        <p className="mt-2">
          <Link href="/simulator/" className={`underline ${focusRing}`}>
            Back to scenarios
          </Link>
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return <p role="alert">{state.message}</p>;
  }

  const { brief } = state;
  return (
    <article aria-labelledby="brief-title">
      <p>
        <Link href="/simulator/" className={`underline ${focusRing}`}>
          Back to scenarios
        </Link>
      </p>
      <h1 id="brief-title" className="mt-4 text-3xl font-semibold">
        {brief.title}
      </h1>
      <p className="mt-3">{brief.objective}</p>
      <dl className="mt-4 grid gap-2">
        <div>
          <dt className="font-semibold">Difficulty</dt>
          <dd>{brief.difficulty}</dd>
        </div>
        <div>
          <dt className="font-semibold">Estimated duration</dt>
          <dd>{brief.est_duration_min} minutes</dd>
        </div>
        <div>
          <dt className="font-semibold">Skills</dt>
          <dd>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Skill tags">
              {brief.skill_tags.map((tag) => (
                <li key={tag} className="rounded border border-border px-2 py-0.5 text-sm">
                  {tag}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() => void onStart(brief.title)}
        disabled={starting}
        aria-label={`Start session for ${brief.title}`}
        className={`mt-6 rounded bg-accent px-5 py-2 font-semibold text-bg disabled:opacity-60 ${focusRing}`}
      >
        {starting ? "Starting…" : "Start session"}
      </button>
      {startError !== null ? (
        <p role="alert" className="mt-3">
          {startError}
        </p>
      ) : null}
    </article>
  );
}
