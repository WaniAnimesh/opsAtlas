"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { addProgress, getBrowserStore, readProgress } from "../../../../lib/local-progress";
import {
  ApiRequestError,
  SCORE_DIMENSION_KEYS,
  createSession,
  fetchDebrief,
  fetchReplayStep,
  type DebriefResult,
  type ReplayEvidenceRef,
  type ReplayStep,
} from "../../../../lib/session-client";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const btn = `rounded border border-border px-3 py-1 disabled:opacity-60 ${focusRing}`;

type Load =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "not-concluded"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; debrief: DebriefResult };

function EvidenceList({ label, items }: { label: string; items: ReplayEvidenceRef[] }): ReactNode {
  return (
    <section aria-label={label}>
      <h4 className="font-semibold">{label}</h4>
      {items.length === 0 ? (
        <p>None.</p>
      ) : (
        <ul className="list-disc pl-5">
          {items.map((e) => (
            <li key={e.evidenceId}>
              {e.evidenceId} ({e.category}, {e.type})
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Replay({ sessionId }: { sessionId: string }): ReactNode {
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<ReplayStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReplayStep(sessionId, index).then(
      (s) => {
        if (cancelled) return;
        setStep(s);
        setError(null);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load the step.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sessionId, index]);

  if (error !== null) return <p role="alert">{error}</p>;
  if (step === null) return <p role="status">Loading replay…</p>;
  if (step.totalSteps === 0) return <p>No decisions were recorded in this session.</p>;

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={btn}
          disabled={index <= 0}
          onClick={() => setIndex((i) => i - 1)}
        >
          Previous
        </button>
        <span>
          Step {step.step + 1} of {step.totalSteps}
        </span>
        <button
          type="button"
          className={btn}
          disabled={index >= step.totalSteps - 1}
          onClick={() => setIndex((i) => i + 1)}
        >
          Next
        </button>
      </div>
      <div aria-live="polite" className="mt-3">
        <p>
          {step.eventType === "action"
            ? `Action: ${step.actionId ?? ""}`
            : `Evidence request: ${step.evidenceId ?? ""}`}{" "}
          at simulated time {step.simTime}
        </p>
        <section aria-label="State at this step">
          <h4 className="font-semibold">State</h4>
          <p>State: {step.state.id}</p>
          <p>Customer impact: {step.state.customer_impact}</p>
          <ul className="list-disc pl-5">
            {Object.entries(step.state.service_health).map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))}
          </ul>
        </section>
        <EvidenceList label="Revealed evidence" items={step.revealedEvidence} />
        <EvidenceList label="Available but unrequested evidence" items={step.unrequestedEvidence} />
        <section aria-label="Alternatives">
          <h4 className="font-semibold">Alternatives</h4>
          {step.alternatives.length === 0 ? (
            <p>{step.noAlternativesNote ?? "No alternatives are defined for this step."}</p>
          ) : (
            <ul className="list-disc pl-5">
              {step.alternatives.map((a) => (
                <li key={`${a.kind}:${a.id}`}>
                  <strong>{a.label}</strong>: {a.description}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export function DebriefClient({ scenarioId }: { scenarioId: string }): ReactNode {
  const router = useRouter();
  const sessionId = useSearchParams().get("session");
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (sessionId === null) {
      void Promise.resolve().then(() => !cancelled && setLoad({ kind: "not-found" }));
      return () => {
        cancelled = true;
      };
    }
    fetchDebrief(sessionId).then(
      (debrief) => !cancelled && setLoad({ kind: "ready", debrief }),
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiRequestError) {
          if (err.status === 404) return setLoad({ kind: "not-found" });
          if (err.status === 409 && err.code === "SESSION_NOT_CONCLUDED") {
            return setLoad({ kind: "not-concluded", message: err.message });
          }
        }
        setLoad({
          kind: "error",
          message: err instanceof Error ? err.message : "Failed to load the debrief.",
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function onRetry(debrief: DebriefResult): Promise<void> {
    setRetryError(null);
    setRetrying(true);
    try {
      // Pin the version the finished session ran against.
      const { sessionId: newKey } = await createSession(scenarioId, debrief.scenarioVersion);
      try {
        const store = getBrowserStore();
        const title =
          readProgress(store).find((e) => e.sessionKey === sessionId)?.scenarioTitle ?? scenarioId;
        addProgress(store, {
          sessionKey: newKey,
          scenarioId,
          scenarioTitle: title,
          startedAt: new Date().toISOString(),
        });
      } catch {
        // History is best-effort and must not block the retry.
      }
      router.push(
        `/simulator/${encodeURIComponent(scenarioId)}/run/?session=${encodeURIComponent(newKey)}`,
      );
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Failed to start a new attempt.");
      setRetrying(false);
    }
  }

  const runHref = `/simulator/${encodeURIComponent(scenarioId)}/run/?session=${encodeURIComponent(sessionId ?? "")}`;

  switch (load.kind) {
    case "loading":
      return <p role="status">Loading debrief…</p>;
    case "not-found":
      return (
        <div role="alert">
          <h1 className="text-2xl font-semibold">Session not found</h1>
          <Link href="/simulator/" className={`underline ${focusRing}`}>
            Back to scenarios
          </Link>
        </div>
      );
    case "not-concluded":
      return (
        <div role="alert">
          <p>{load.message}</p>
          <Link href={runHref} className={`underline ${focusRing}`}>
            Back to the session
          </Link>
        </div>
      );
    case "error":
      return <p role="alert">{load.message}</p>;
    case "ready":
      break;
  }

  const { debrief } = load;
  return (
    <article aria-labelledby="debrief-title">
      <h1 id="debrief-title" className="text-3xl font-semibold">
        Debrief
      </h1>
      {debrief.terminalOutcome !== null ? (
        <p className="mt-2">Outcome: {debrief.terminalOutcome}</p>
      ) : null}
      {debrief.terminalDebrief !== null ? <p className="mt-2">{debrief.terminalDebrief}</p> : null}

      <h2 className="mt-6 text-xl font-semibold">Scores</h2>
      <dl className="mt-2 grid gap-3">
        {SCORE_DIMENSION_KEYS.map((key) => (
          <div key={key}>
            <dt className="font-semibold">{debrief.labels[key]}</dt>
            <dd>
              {debrief.scores[key]} / {debrief.maxScore}
              <p className="m-0">{debrief.feedback[key]}</p>
            </dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-6 text-xl font-semibold">Decision replay</h2>
      {sessionId !== null ? <Replay sessionId={sessionId} /> : null}

      <p className="mt-6">
        {debrief.incidentSlug !== "" ? (
          <Link
            href={`/atlas/incidents/${encodeURIComponent(debrief.incidentSlug)}/`}
            className={`underline ${focusRing}`}
          >
            View the source incident
          </Link>
        ) : null}
      </p>

      <button
        type="button"
        onClick={() => void onRetry(debrief)}
        disabled={retrying}
        className={`mt-4 rounded bg-accent px-5 py-2 font-semibold text-bg disabled:opacity-60 ${focusRing}`}
      >
        {retrying ? "Starting…" : "Retry scenario"}
      </button>
      {retryError !== null ? (
        <p role="alert" className="mt-3">
          {retryError}
        </p>
      ) : null}
    </article>
  );
}
