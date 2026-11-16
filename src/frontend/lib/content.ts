/**
 * Build-time (server-only) content loader. Reads incident JSON files from the
 * repo-level content/incidents directory. Do not import from client components:
 * it uses node:fs. Shared by Atlas list (12.3), search/filter (12.4) and detail (12.5).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const INCIDENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface IncidentSource {
  publisher: string;
  url: string;
  published_at?: string;
  source_tier?: string;
}

/** Frontend mirror of the backend IncidentContentFile. */
export interface IncidentRecord {
  slug: string;
  title: string;
  org: string;
  incident_date: string;
  summary: string;
  impact: string;
  failure_domain: string;
  severity: string;
  is_reconstruction: boolean;
  skill_tags: string[];
  technology?: string | string[];
  sources: IncidentSource[];
  timeline: Record<string, unknown>[];
  causal_factors: Record<string, unknown>[];
  lessons: Record<string, unknown>[];
}

/** Serializable subset passed to client components. */
export interface IncidentSummary {
  slug: string;
  title: string;
  org: string;
  incident_date: string;
  summary: string;
  failure_domain: string;
  severity: string;
  skill_tags: string[];
}

export function getIncidentsDir(): string {
  const override = process.env["OPSATLAS_INCIDENTS_DIR"];
  return override ? path.resolve(override) : path.resolve(process.cwd(), "../../content/incidents");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function isIncidentRecord(value: unknown): value is IncidentRecord {
  if (!isRecord(value)) return false;
  const tech = value["technology"];
  return (
    typeof value["slug"] === "string" &&
    INCIDENT_SLUG_PATTERN.test(value["slug"]) &&
    typeof value["title"] === "string" &&
    typeof value["org"] === "string" &&
    typeof value["incident_date"] === "string" &&
    typeof value["summary"] === "string" &&
    typeof value["impact"] === "string" &&
    typeof value["failure_domain"] === "string" &&
    typeof value["severity"] === "string" &&
    typeof value["is_reconstruction"] === "boolean" &&
    isStringArray(value["skill_tags"]) &&
    Array.isArray(value["sources"]) &&
    Array.isArray(value["timeline"]) &&
    Array.isArray(value["causal_factors"]) &&
    Array.isArray(value["lessons"]) &&
    (tech === undefined || typeof tech === "string" || isStringArray(tech))
  );
}

function readRecord(file: string): IncidentRecord | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return isIncidentRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** All valid incidents, newest first; ties broken by slug ascending. */
export function listIncidents(dir: string = getIncidentsDir()): IncidentRecord[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const records = names
    .map((n) => readRecord(path.join(dir, n)))
    .filter((r): r is IncidentRecord => r !== null);
  return records.sort((a, b) => {
    const byDate = b.incident_date.localeCompare(a.incident_date);
    return byDate !== 0 ? byDate : a.slug.localeCompare(b.slug);
  });
}

/** Looks up by slug (matches the record's slug field); rejects invalid slugs. */
export function getIncidentBySlug(
  slug: string,
  dir: string = getIncidentsDir(),
): IncidentRecord | null {
  if (!INCIDENT_SLUG_PATTERN.test(slug)) return null;
  return listIncidents(dir).find((r) => r.slug === slug) ?? null;
}

export function toIncidentSummary(r: IncidentRecord): IncidentSummary {
  return {
    slug: r.slug,
    title: r.title,
    org: r.org,
    incident_date: r.incident_date,
    summary: r.summary,
    failure_domain: r.failure_domain,
    severity: r.severity,
    skill_tags: [...r.skill_tags],
  };
}
