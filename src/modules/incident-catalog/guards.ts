/** Runtime-neutral incident content guard (type-only imports). */
import type { IncidentContentFile } from "../../types/index.js";

export const INCIDENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isIncidentContentFile(value: unknown): value is IncidentContentFile {
  if (!isRecord(value)) {
    return false;
  }

  const technology = value["technology"];
  const technologyIsValid =
    technology === undefined || typeof technology === "string" || isStringArray(technology);

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
    technologyIsValid
  );
}
