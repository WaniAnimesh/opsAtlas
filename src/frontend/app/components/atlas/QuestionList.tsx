import Link from "next/link";
import type { ReactNode } from "react";
import type { Atlas } from "../../../lib/atlas/load";
import { entityHref, journeyHref } from "../../../lib/atlas/meta";
import { ENTRY_QUESTIONS } from "../../../lib/atlas/questions";

/** Server-only: resolves each entry question to a page so links never break. */
export function QuestionList({ atlas }: { atlas: Atlas }): ReactNode {
  const items = ENTRY_QUESTIONS.map((q) => {
    if (q.target.startsWith("journey:")) {
      const id = q.target.slice("journey:".length);
      return atlas.journeys.some((j) => j.id === id) ? { q: q.question, href: journeyHref(id) } : null;
    }
    const e = atlas.graph.nodes.get(q.target);
    return e ? { q: q.question, href: entityHref(e) } : null;
  }).filter((x): x is { q: string; href: string } => x !== null);

  return (
    <ul className="mt-3 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3" data-testid="question-list">
      {items.map((i) => (
        <li key={i.q}>
          <Link
            href={i.href}
            className="block rounded-md border border-border bg-bg px-4 py-3 font-medium text-accent no-underline hover:border-accent hover:underline"
          >
            {i.q}
          </Link>
        </li>
      ))}
    </ul>
  );
}
