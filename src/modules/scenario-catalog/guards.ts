/**
 * Runtime-neutral guards and helpers for scenario content files.
 *
 * This file has only type-level imports so it can be used by the Worker bundle,
 * the Node server and the build scripts alike.
 */
import type { ScenarioContentFile, ScenarioDifficulty } from "../../types/index.js";

export const SCENARIO_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function isScenarioDifficulty(value: unknown): value is ScenarioDifficulty {
  return value === "beginner" || value === "intermediate" || value === "advanced";
}

/**
 * Validate the schema fields needed to safely expose a scenario from content.
 * The full JSON schema is also checked by the content-validation script; this
 * guard keeps the catalog safe when it reads content directly at runtime.
 */
export function isScenarioContentFile(
  value: unknown,
  expectedId?: string,
): value is ScenarioContentFile {
  if (!isRecord(value)) {
    return false;
  }

  const scenarioId = value["id"];
  const definition = value["definition"];
  const estimatedDuration = value["est_duration_min"];
  return (
    typeof scenarioId === "string" &&
    SCENARIO_ID_PATTERN.test(scenarioId) &&
    (expectedId === undefined || scenarioId === expectedId) &&
    typeof value["incident_slug"] === "string" &&
    value["incident_slug"].length > 0 &&
    typeof value["title"] === "string" &&
    value["title"].length > 0 &&
    typeof value["objective"] === "string" &&
    value["objective"].length > 0 &&
    value["objective"].length <= 160 &&
    isScenarioDifficulty(value["difficulty"]) &&
    typeof estimatedDuration === "number" &&
    Number.isInteger(estimatedDuration) &&
    estimatedDuration >= 5 &&
    estimatedDuration <= 240 &&
    (value["time_limit_min"] === undefined || Number.isInteger(value["time_limit_min"])) &&
    typeof value["rubric_version"] === "string" &&
    value["rubric_version"].length > 0 &&
    isStringArray(value["skill_tags"]) &&
    typeof value["version"] === "string" &&
    value["version"].length > 0 &&
    isRecord(definition) &&
    typeof definition["initial_state_id"] === "string" &&
    definition["initial_state_id"].length > 0 &&
    isRecord(definition["states"]) &&
    isRecord(definition["actions"]) &&
    Array.isArray(definition["transitions"]) &&
    isRecord(definition["evidence"])
  );
}

/** Numeric semver comparison (major.minor.patch, optional pre-release ignored for order ties). */
export function compareSemver(left: string, right: string): number {
  const parse = (value: string): number[] =>
    value
      .split("-")[0]!
      .split(".")
      .map((part) => {
        const n = Number.parseInt(part, 10);
        return Number.isNaN(n) ? 0 : n;
      });
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return left.localeCompare(right);
}

/** The highest semver version of each scenario id, ordered by id. */
export function latestPerId(scenarios: readonly ScenarioContentFile[]): ScenarioContentFile[] {
  const latest = new Map<string, ScenarioContentFile>();
  for (const scenario of scenarios) {
    const current = latest.get(scenario.id);
    if (current === undefined || compareSemver(scenario.version, current.version) > 0) {
      latest.set(scenario.id, scenario);
    }
  }
  return [...latest.values()].sort((left, right) => left.id.localeCompare(right.id));
}
