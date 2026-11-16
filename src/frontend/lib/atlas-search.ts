/**
 * Pure client-side search/filter for the Atlas page. Mirrors the backend
 * incident-catalog semantics: case-insensitive substring match, all query terms
 * AND across title/summary/skill_tags/technology; filters AND across dimensions,
 * OR within a dimension; provider = org; technology matches technology or skill_tags.
 */
export const MAX_QUERY_LENGTH = 200;

export interface AtlasEntry {
  slug: string;
  title: string;
  summary: string;
  skill_tags: string[];
  failure_domain: string;
  severity: string;
  org: string;
  technology?: string | string[];
}

export interface AtlasFilters {
  provider: readonly string[];
  technology: readonly string[];
  failure_domain: readonly string[];
}

export const EMPTY_FILTERS: AtlasFilters = { provider: [], technology: [], failure_domain: [] };

function norm(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function techValues(e: AtlasEntry): string[] {
  if (e.technology === undefined) return [];
  return Array.isArray(e.technology) ? e.technology : [e.technology];
}

export function parseTerms(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map(norm)
    .filter((t) => t.length > 0);
}

function matchesDimension(candidates: readonly string[], selected: readonly string[]): boolean {
  const wanted = selected.map(norm).filter((s) => s.length > 0);
  if (wanted.length === 0) return true;
  return wanted.some((w) => candidates.some((c) => norm(c) === w));
}

export function matchesEntry(entry: AtlasEntry, terms: readonly string[], filters: AtlasFilters): boolean {
  const techs = [...techValues(entry), ...entry.skill_tags];
  if (
    !(
      matchesDimension([entry.org], filters.provider) &&
      matchesDimension(techs, filters.technology) &&
      matchesDimension([entry.failure_domain], filters.failure_domain)
    )
  ) {
    return false;
  }
  if (terms.length === 0) return true;
  const haystack = [entry.title, entry.summary, ...entry.skill_tags, ...techValues(entry)].map(norm);
  return terms.every((t) => haystack.some((h) => h.includes(t)));
}

export function filterIncidents<T extends AtlasEntry>(
  entries: readonly T[],
  query: string,
  filters: AtlasFilters,
): T[] {
  const terms = parseTerms(query.slice(0, MAX_QUERY_LENGTH));
  return entries.filter((e) => matchesEntry(e, terms, filters));
}

export interface FilterOptions {
  provider: string[];
  technology: string[];
  failure_domain: string[];
}

function uniqSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function buildFilterOptions(entries: readonly AtlasEntry[]): FilterOptions {
  return {
    provider: uniqSorted(entries.map((e) => e.org)),
    technology: uniqSorted(entries.flatMap((e) => [...techValues(e), ...e.skill_tags])),
    failure_domain: uniqSorted(entries.map((e) => e.failure_domain)),
  };
}

export function hasActiveFilters(query: string, filters: AtlasFilters): boolean {
  return (
    query.trim().length > 0 ||
    filters.provider.length > 0 ||
    filters.technology.length > 0 ||
    filters.failure_domain.length > 0
  );
}
