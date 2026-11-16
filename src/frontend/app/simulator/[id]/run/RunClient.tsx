"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  abandonRunSession,
  ApiRequestError,
  fetchRunSession,
  fetchSessionOptions,
  pauseRunSession,
  requestEvidence,
  resumeRunSession,
  submitAction,
  type ActionOption,
  type EvidenceResponse,
  type RunSession,
  type SessionOptions,
} from "../../../../lib/session-client";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const btn = `rounded border border-border px-3 py-1 disabled:opacity-60 ${focusRing}`;
const TERMINAL = new Set(["completed", "abandoned", "timed_out"]);

type Load =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "fatal"; message: string }
  | { kind: "ready"; session: RunSession; options: SessionOptions };

function ConfirmDialog({
  action,
  rationale,
  onConfirm,
  onCancel,
}: {
  action: ActionOption;
  rationale: string;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => previous?.focus();
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("button") ?? []);
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-fg/40">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        onKeyDown={onKeyDown}
        className="max-w-md rounded border border-border bg-bg p-5"
      >
        <h2 id="confirm-title" className="text-lg font-semibold">
          Confirm irreversible action: {action.label}
        </h2>
        <div id="confirm-desc">
          <p className="mt-2">This action is irreversible and cannot be undone.</p>
          <p className="mt-2">It modifies these state attributes:</p>
          <ul className="list-disc pl-6">
            {(action.modifiedAttributes ?? []).map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          {rationale !== "" ? <p className="mt-2">Rationale: {rationale}</p> : null}
        </div>
        <div className="mt-4 flex gap-3">
          <button type="button" onClick={onCancel} className={btn}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className={`${btn} bg-accent text-bg`}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function Entries({ data }: { data: Record<string, unknown> | string[] }): ReactNode {
  const rows = Array.isArray(data)
    ? data.map((v, i) => [String(i), v] as const)
    : Object.entries(data);
  if (rows.length === 0) return <p>None</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-medium">{Array.isArray(data) ? "•" : k}</dt>
          <dd>{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RunClient({ scenarioId }: { scenarioId: string }): ReactNode {
  const router = useRouter();
  const sessionId = useSearchParams().get("session");
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<ActionOption | null>(null);
  const [results, setResults] = useState<Record<string, EvidenceResponse>>({});

  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  /** Fetches the session view; pure with respect to component state. */
  const fetchLoad = useCallback(async (): Promise<Load | "terminal"> => {
    if (sessionId === null || sessionId === "") return { kind: "not-found" };
    try {
      const [session, options] = await Promise.all([
        fetchRunSession(sessionId),
        fetchSessionOptions(sessionId),
      ]);
      if (TERMINAL.has(session.status)) {
        routerRef.current.push(
          `/simulator/${encodeURIComponent(scenarioId)}/debrief/?session=${encodeURIComponent(sessionId)}`,
        );
        return "terminal";
      }
      return { kind: "ready", session, options };
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) return { kind: "not-found" };
      return {
        kind: "fatal",
        message: err instanceof Error ? err.message : "Failed to load the session.",
      };
    }
  }, [sessionId, scenarioId]);

  const refresh = useCallback(async (): Promise<void> => {
    const next = await fetchLoad();
    if (next !== "terminal") setLoad(next);
  }, [fetchLoad]);

  useEffect(() => {
    let cancelled = false;
    void fetchLoad().then((next) => {
      if (!cancelled && next !== "terminal") setLoad(next);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchLoad]);
  async function run(op: (id: string) => Promise<unknown>): Promise<void> {
    if (sessionId === null) {
      setLoad({ kind: "not-found" });
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await op(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request failed.");
    }
    await refresh();
    setBusy(false);
  }

  if (load.kind === "loading") {
    return (
      <p role="status" aria-live="polite">
        Loading session…
      </p>
    );
  }
  if (load.kind === "not-found") {
    return (
      <div role="alert">
        <h1 className="text-2xl font-semibold">Session not found</h1>
        <p className="mt-2">
          <Link href="/simulator/" className={`underline ${focusRing}`}>
            Back to scenarios
          </Link>
        </p>
      </div>
    );
  }
  if (load.kind === "fatal") return <p role="alert">{load.message}</p>;

  const { session, options } = load;
  const paused = session.status === "paused";
  const disabled = paused || busy;
  const s = session.state;

  const rationaleFor = (a: ActionOption): string =>
    rationales[a.id] ?? a.rationale_options[0] ?? "";
  const doAction = (a: ActionOption): void => {
    void run((id) => submitAction(id, a.id, rationaleFor(a)));
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">Incident simulation</h1>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <p>
          <span id="sim-time-label">Simulated time (not wall-clock time)</span>:{" "}
          <span role="timer" aria-labelledby="sim-time-label">
            {session.simTimeElapsed} min
          </span>
        </p>
        <p role="status" aria-live="polite">
          {paused ? "Paused" : "Active"}
        </p>
        {paused ? (
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() => void run((id) => resumeRunSession(id))}
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() => void run((id) => pauseRunSession(id))}
          >
            Pause
          </button>
        )}
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={() => void run((id) => abandonRunSession(id))}
        >
          Abandon
        </button>
      </div>
      {error !== null ? (
        <p role="alert" className="mt-3">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="state-h" className="mt-6">
        <h2 id="state-h" className="text-xl font-semibold">
          System state
        </h2>
        <h3 className="mt-2 font-semibold">Service health</h3>
        <Entries data={s.service_health} />
        <h3 className="mt-2 font-semibold">Metrics</h3>
        <Entries data={s.metrics} />
        <h3 className="mt-2 font-semibold">Customer impact</h3>
        <p>{s.customer_impact}</p>
        <h3 className="mt-2 font-semibold">Active alerts</h3>
        <Entries data={s.active_alerts} />
      </section>

      <section aria-labelledby="actions-h" className="mt-6">
        <h2 id="actions-h" className="text-xl font-semibold">
          Actions
        </h2>
        <ul className="m-0 list-none p-0">
          {options.actions.map((a) => (
            <li key={a.id} className="mt-3 border-b border-border pb-3">
              <p className="font-medium">
                {a.label} ({a.time_cost} min{a.reversible ? "" : ", irreversible"})
              </p>
              {a.rationale_options.length > 0 ? (
                <label className="block">
                  Rationale for {a.label}{" "}
                  <select
                    value={rationaleFor(a)}
                    disabled={disabled}
                    onChange={(e) => setRationales({ ...rationales, [a.id]: e.target.value })}
                    className={`border border-border bg-bg ${focusRing}`}
                  >
                    {a.rationale_options.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                disabled={disabled || !a.available}
                aria-describedby={a.available ? undefined : `unmet-${a.id}`}
                onClick={() => (a.reversible ? doAction(a) : setConfirming(a))}
                className={`mt-1 ${btn}`}
              >
                Perform {a.label}
              </button>
              {!a.available ? (
                <p id={`unmet-${a.id}`}>Unavailable: {a.unmetPreconditions.join("; ")}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="evidence-h" className="mt-6">
        <h2 id="evidence-h" className="text-xl font-semibold">
          Evidence
        </h2>
        <ul className="m-0 list-none p-0">
          {options.evidence.map((ev) => {
            const result = results[ev.id];
            return (
              <li key={ev.id} className="mt-3">
                <button
                  type="button"
                  disabled={disabled}
                  className={btn}
                  onClick={() =>
                    void run(async (id) => {
                      const r = await requestEvidence(id, ev.id);
                      setResults((prev) => ({ ...prev, [ev.id]: r }));
                    })
                  }
                >
                  Request {ev.id} ({ev.type}, {ev.time_cost} min)
                </button>
                {ev.requested ? <span> Requested</span> : null}
                {result === undefined ? null : result.status === "unavailable" ? (
                  <p>Evidence {ev.id} is unavailable.</p>
                ) : (
                  <pre className="overflow-auto">{JSON.stringify(result.payload, null, 2)}</pre>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {confirming !== null ? (
        <ConfirmDialog
          action={confirming}
          rationale={rationaleFor(confirming)}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const a = confirming;
            setConfirming(null);
            doAction(a);
          }}
        />
      ) : null}
    </div>
  );
}
