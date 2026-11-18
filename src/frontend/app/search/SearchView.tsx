"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TypeBadge } from "../components/atlas/primitives";
import { MAX_QUERY_LENGTH, searchDocs, type SearchDoc, type SearchDocType } from "../../lib/atlas/search";

const DEBOUNCE_MS = 120;
const MAX_RESULTS = 50;

export interface SearchViewProps {
  docs: SearchDoc[];
  suggestions: string[];
}

export function SearchView({ docs, suggestions }: SearchViewProps): ReactNode {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initial = (params.get("q") ?? "").slice(0, MAX_QUERY_LENGTH);
  const [input, setInput] = useState(initial);
  const [query, setQuery] = useState(initial);
  const [types, setTypes] = useState<Set<SearchDocType>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setQuery(input), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  // Keep the URL shareable without adding history entries per keystroke.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (current === query) return;
    const qs = query ? `?q=${encodeURIComponent(query)}` : "";
    router.replace(`${pathname}${qs}`, { scroll: false });
  }, [query, params, pathname, router]);

  const typeOptions = useMemo(() => {
    const seen = new Map<SearchDocType, string>();
    for (const d of docs) seen.set(d.type, d.typeLabel);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [docs]);

  const results = useMemo(() => (query.trim() ? searchDocs(docs, query, types).slice(0, MAX_RESULTS) : []), [docs, query, types]);

  function toggle(t: SearchDocType): void {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  return (
    <div className="grid gap-6">
      <form role="search" aria-label="Search the Decision Atlas" onSubmit={(e) => e.preventDefault()} className="grid gap-3">
        <label htmlFor="atlas-q" className="font-medium">
          Search technologies, decisions, failure patterns or a problem in your own words
        </label>
        <input
          id="atlas-q"
          type="search"
          value={input}
          maxLength={MAX_QUERY_LENGTH}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Kafka, or: how do I reduce database load?"
          className="rounded border border-border bg-surface p-3 text-base"
        />
        <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">Filter by content type</legend>
          {typeOptions.map(([t, label]) => (
            <label key={t} className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-sm">
              <input type="checkbox" checked={types.has(t)} onChange={() => toggle(t)} />
              {label}
            </label>
          ))}
        </fieldset>
      </form>

      <p aria-live="polite" className="m-0 text-sm text-muted">
        {query.trim() ? `${results.length} result${results.length === 1 ? "" : "s"} for “${query.trim()}”` : "Type to search."}
      </p>

      {query.trim() && results.length === 0 ? (
        <p className="m-0 rounded border border-border bg-surface p-4 text-muted">
          No matches. Try a technology name, a decision such as “monolith vs microservices”, or describe the problem.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ol className="m-0 grid list-none gap-3 p-0" data-testid="search-results">
          {results.map(({ doc }) => (
            <li key={doc.id} className="rounded-md border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <TypeBadge type={doc.type} />
                {doc.layer ? <span className="text-xs text-muted">{doc.layer}</span> : null}
              </div>
              <h2 className="mt-2 mb-0 text-lg font-semibold">
                <Link href={doc.href} className="text-accent underline-offset-4 hover:underline">
                  {doc.title}
                </Link>
              </h2>
              <p className="mt-1 mb-0 text-sm text-muted">{doc.question ?? doc.description}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {!query.trim() ? (
        <section aria-labelledby="try-h">
          <h2 id="try-h" className="m-0 text-lg font-semibold">
            Try a problem
          </h2>
          <ul className="mt-2 flex list-none flex-wrap gap-2 p-0">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => setInput(s)}
                  className="rounded border border-border bg-bg px-3 py-1.5 text-sm text-accent hover:border-accent"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
