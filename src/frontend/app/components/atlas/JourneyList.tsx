import Link from "next/link";
import type { ReactNode } from "react";
import { journeyHref } from "../../../lib/atlas/meta";
import type { Journey } from "../../../lib/atlas/types";

export function JourneyList({ journeys }: { journeys: Journey[] }): ReactNode {
  return (
    <ul className="mt-3 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2" data-testid="journey-list">
      {journeys.map((j) => (
        <li key={j.id} className="rounded-md border border-border bg-surface p-4">
          <h3 className="m-0 text-base font-semibold">
            <Link href={journeyHref(j.id)} className="text-accent underline-offset-4 hover:underline">
              {j.title}
            </Link>
          </h3>
          <p className="mt-1 mb-0 text-sm text-muted">{j.summary}</p>
          <p className="mt-2 mb-0 font-mono text-xs text-muted">{j.steps.length} steps</p>
        </li>
      ))}
    </ul>
  );
}
