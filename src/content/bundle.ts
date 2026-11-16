import type { IncidentContentFile, ScenarioContentFile } from "../types/index.js";
import type { RubricDefinition } from "../modules/scoring-debrief/rubric.js";

/**
 * Content compiled into the Worker at build time by
 * `scripts/build-content-bundle.ts` (written to `src/generated/content-bundle.json`).
 */
export interface ContentBundle {
  generatedAt: string;
  /** Every published scenario version. */
  scenarios: ScenarioContentFile[];
  /** Every Rubric version. */
  rubrics: RubricDefinition[];
  incidents: IncidentContentFile[];
}
