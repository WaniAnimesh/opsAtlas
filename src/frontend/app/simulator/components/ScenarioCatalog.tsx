"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { fetchScenarios } from "../../../lib/scenarios";
import type { ScenarioDifficulty, ScenarioSummary } from "../../../lib/scenarios";

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; scenarios: ScenarioSummary[] };

export const DIFFICULTY_LABELS: Record<ScenarioDifficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const DIFFICULTY_LEVEL: Record<ScenarioDifficulty, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

function ScenarioCard({ scenario }: { scenario: ScenarioSummary }): ReactNode {
  const level = DIFFICULTY_LEVEL[scenario.difficulty];
  const label = DIFFICULTY_LABELS[scenario.difficulty];
  return (
    <li>
      <Link
        href={`/simulator/${scenario.id}/brief/`}
        className="block h-full rounded border border-border bg-surface p-4 text-fg no-underline hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <h2 className="mb-2 text-lg font-semibold">{scenario.title}</h2>
        <p className="mb-3 text-sm">
          <span className="font-medium">Difficulty: {label}</span>
          <span aria-hidden="true" className="ml-2 font-mono">
            {"●".repeat(level)}
            {"○".repeat(3 - level)}
          </span>
          <span className="mx-2" aria-hidden="true">
            &middot;
          </span>
          <span>{scenario.est_duration_min} min</span>
        </p>
        <p className="mb-3 text-sm text-muted">{scenario.objective}</p>
        {scenario.skill_tags.length > 0 ? (
          <ul aria-label="Skills" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {scenario.skill_tags.map((tag) => (
              <li key={tag} className="rounded border border-border px-2 py-0.5 text-xs">
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
      </Link>
    </li>
  );
}

export function ScenarioCatalog(): ReactNode {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchScenarios(controller.signal).then(
      (scenarios) => {
        if (!controller.signal.aborted) setState({ kind: "ready", scenarios });
      },
      () => {
        if (!controller.signal.aborted) setState({ kind: "error" });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  if (state.kind === "loading") {
    return (
      <p role="status" aria-live="polite">
        Loading scenarios…
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <div role="alert">
        <p className="mb-3">Scenarios could not be loaded. Check your connection and try again.</p>
        <button
          type="button"
          onClick={retry}
          className="rounded border border-border bg-surface px-4 py-2 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Retry
        </button>
      </div>
    );
  }

  if (state.scenarios.length === 0) {
    return <p>Scenarios are coming soon. Check back shortly for new incident simulations.</p>;
  }

  return (
    <ul aria-label="Scenarios" className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
      {state.scenarios.map((s) => (
        <ScenarioCard key={s.id} scenario={s} />
      ))}
    </ul>
  );
}
