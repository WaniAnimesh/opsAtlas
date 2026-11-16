"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { IncidentSummary } from "../../../lib/content";
import {
  EMPTY_FILTERS,
  MAX_QUERY_LENGTH,
  buildFilterOptions,
  filterIncidents,
  hasActiveFilters,
  type AtlasFilters,
} from "../../../lib/atlas-search";
import { IncidentCard } from "./IncidentCard";

export interface AtlasBrowserProps {
  incidents: IncidentSummary[];
}

const SEARCH_INDEX_URL = "/search-index.json";
const DEBOUNCE_MS = 100;

type Dimension = keyof AtlasFilters;

const GROUPS: { key: Dimension; legend: string }[] = [
  { key: "provider", legend: "Provider" },
  { key: "technology", legend: "Technology" },
  { key: "failure_domain", legend: "Failure domain" },
];

function isIndexArray(value: unknown): value is IncidentSummary[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as IncidentSummary).slug === "string" &&
        typeof (v as IncidentSummary).title === "string" &&
        Array.isArray((v as IncidentSummary).skill_tags),
    )
  );
}

export function AtlasBrowser({ incidents }: AtlasBrowserProps): ReactNode {
  // Search source is the static search index; server-provided incidents are the fallback.
  const [source, setSource] = useState<IncidentSummary[]>(incidents);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AtlasFilters>(EMPTY_FILTERS);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const res = await fetch(SEARCH_INDEX_URL);
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (!cancelled && isIndexArray(data) && data.length > 0) {
          // Keep server-provided order and card fields (dates); index supplies searchable data.
          const byDate = new Map(incidents.map((i) => [i.slug, i.incident_date]));
          setSource(data.map((d) => ({ ...d, incident_date: byDate.get(d.slug) ?? d.incident_date ?? "" })));
        }
      } catch {
        /* fall back to server-provided incidents */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [incidents]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(input), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  const options = useMemo(() => buildFilterOptions(source), [source]);
  const results = useMemo(() => filterIncidents(source, query, filters), [source, query, filters]);

  if (source.length === 0) {
    return (
      <p className="rounded border border-border bg-surface p-6 text-muted">
        Incident content is coming soon.
      </p>
    );
  }

  function toggle(key: Dimension, value: string): void {
    setFilters((prev) => {
      const current = prev[key];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
  }

  function clearAll(): void {
    setInput("");
    setQuery("");
    setFilters(EMPTY_FILTERS);
  }

  const active = hasActiveFilters(input, filters);
  const count = results.length;

  return (
    <div className="grid gap-4">
      <form role="search" aria-label="Search and filter incidents" onSubmit={(e) => e.preventDefault()} className="grid gap-4">
        <div className="grid gap-1">
          <label htmlFor="atlas-search" className="font-medium">
            Search incidents
          </label>
          <input
            id="atlas-search"
            type="search"
            value={input}
            maxLength={MAX_QUERY_LENGTH}
            onChange={(e) => setInput(e.target.value)}
            className="rounded border border-border bg-surface p-2 focus-visible:ring-2 focus-visible:ring-focus"
          />
        </div>
        <div className="flex flex-wrap gap-4">
          {GROUPS.map(({ key, legend }) => (
            <fieldset key={key} className="m-0 min-w-0 rounded border border-border p-3">
              <legend className="px-1 font-medium">{legend}</legend>
              <div className="grid max-h-48 gap-1 overflow-y-auto">
                {options[key].map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={filters[key].includes(value)}
                      onChange={() => toggle(key, value)}
                      className="focus-visible:ring-2 focus-visible:ring-focus"
                    />
                    {value}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div>
          <button
            type="button"
            onClick={clearAll}
            disabled={!active}
            className="rounded border border-border px-3 py-1 focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
          >
            Clear all
          </button>
        </div>
      </form>
      <p role="status" aria-live="polite" className="m-0 text-sm text-muted">
        {count === 1 ? "1 incident found" : `${count} incidents found`}
      </p>
      {count === 0 ? (
        <p className="rounded border border-border bg-surface p-6 text-muted">
          No incidents match your search and filters. Adjust or clear them to see more.
        </p>
      ) : (
        <ul aria-label="Incidents" className="m-0 grid list-none gap-4 p-0">
          {results.map((incident) => (
            <li key={incident.slug}>
              <IncidentCard incident={incident} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
