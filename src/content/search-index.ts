// Pure transform for the static search index (Requirement 2.1).

export interface SearchIndexEntry {
  slug: string;
  title: string;
  summary: string;
  skill_tags: string[];
  failure_domain: string;
  severity: string;
  org: string;
  technology?: string;
}

interface IncidentLike {
  slug: string;
  title: string;
  summary: string;
  skill_tags: string[];
  failure_domain: string;
  severity: string;
  org: string;
  incident_date: string;
  technology?: unknown;
}

/** Extract the search fields with a stable key order. */
export function toSearchEntry(incident: IncidentLike): SearchIndexEntry {
  const entry: SearchIndexEntry = {
    slug: incident.slug,
    title: incident.title,
    summary: incident.summary,
    skill_tags: [...incident.skill_tags],
    failure_domain: incident.failure_domain,
    severity: incident.severity,
    org: incident.org,
  };
  if (typeof incident.technology === "string" && incident.technology.length > 0) {
    entry.technology = incident.technology;
  }
  return entry;
}

/** Build the index: sorted by incident_date desc, then slug asc. */
export function buildSearchIndex(incidents: readonly IncidentLike[]): SearchIndexEntry[] {
  return [...incidents]
    .sort((a, b) => {
      if (a.incident_date !== b.incident_date) {
        return a.incident_date < b.incident_date ? 1 : -1;
      }
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    })
    .map(toSearchEntry);
}

/** Deterministic serialization: 2-space JSON with trailing newline. */
export function serializeSearchIndex(entries: readonly SearchIndexEntry[]): string {
  return JSON.stringify(entries, null, 2) + "\n";
}
