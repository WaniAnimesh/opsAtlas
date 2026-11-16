import Link from "next/link";
import type { ReactNode } from "react";
import type { IncidentSummary } from "../../../lib/content";

export const MAX_CARD_TAGS = 3;

export function IncidentCard({ incident }: { incident: IncidentSummary }): ReactNode {
  const tags = incident.skill_tags.slice(0, MAX_CARD_TAGS);
  return (
    <article className="rounded border border-border bg-surface p-4 focus-within:ring-2 focus-within:ring-focus">
      <h2 className="m-0 text-lg font-semibold">
        <Link
          href={`/atlas/incidents/${incident.slug}/`}
          className="rounded text-accent underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-focus"
        >
          {incident.title}
        </Link>
      </h2>
      <dl className="mt-2 mb-0 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        <div className="flex gap-1">
          <dt>Provider:</dt>
          <dd className="m-0 text-fg">{incident.org}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Failure domain:</dt>
          <dd className="m-0 text-fg">{incident.failure_domain}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Severity:</dt>
          <dd className="m-0 text-fg">{incident.severity}</dd>
        </div>
      </dl>
      {tags.length > 0 && (
        <ul aria-label="Skill tags" className="mt-3 mb-0 flex list-none flex-wrap gap-2 p-0">
          {tags.map((tag) => (
            <li key={tag} className="rounded border border-border px-2 py-0.5 font-mono text-xs text-muted">
              {tag}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
