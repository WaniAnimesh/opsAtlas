/**
 * Pure content-bundle builder (no I/O). `scripts/build-content-bundle.ts`
 * reads the files and calls this; tests call it directly.
 *
 * Relative runtime imports are extensionless on purpose: the build script runs
 * under ts-node (CommonJS), which cannot map `.js` specifiers to `.ts` files.
 */
import type { IncidentContentFile, ScenarioContentFile } from "../types/index";
import type { RubricDefinition } from "../modules/scoring-debrief/rubric";
import { isRubricDefinition } from "../modules/scoring-debrief/rubric";
import { isScenarioContentFile } from "../modules/scenario-catalog/guards";
import { isIncidentContentFile } from "../modules/incident-catalog/guards";
import type { ContentBundle } from "./bundle";

export interface RawContentFile {
  /** Display name used in error messages, e.g. `content/scenarios/x@1.0.0.json`. */
  file: string;
  data: unknown;
}

export interface BundleSources {
  scenarios: readonly RawContentFile[];
  rubrics: readonly RawContentFile[];
  incidents: readonly RawContentFile[];
}

/** Thrown when content cannot be bundled; `problems` has one message per issue. */
export class ContentBundleError extends Error {
  public constructor(public readonly problems: readonly string[]) {
    super(`Content bundle failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ContentBundleError";
  }
}

export function buildContentBundle(
  sources: BundleSources,
  generatedAt: string = new Date().toISOString(),
): ContentBundle {
  const problems: string[] = [];

  const rubrics: RubricDefinition[] = [];
  const rubricVersions = new Set<string>();
  for (const { file, data } of sources.rubrics) {
    if (!isRubricDefinition(data)) {
      problems.push(`${file}: not a valid rubric definition`);
      continue;
    }
    if (rubricVersions.has(data.version)) {
      problems.push(`${file}: duplicate rubric version "${data.version}"`);
      continue;
    }
    rubricVersions.add(data.version);
    rubrics.push(data);
  }

  const scenarios: ScenarioContentFile[] = [];
  const scenarioKeys = new Map<string, string>();
  for (const { file, data } of sources.scenarios) {
    if (!isScenarioContentFile(data)) {
      problems.push(`${file}: not a valid scenario content file`);
      continue;
    }
    const key = `${data.id}@${data.version}`;
    const firstFile = scenarioKeys.get(key);
    if (firstFile !== undefined) {
      problems.push(`${file}: duplicate scenario (id, version) pair ${key} (also in ${firstFile})`);
      continue;
    }
    scenarioKeys.set(key, file);
    if (!rubricVersions.has(data.rubric_version)) {
      problems.push(`${file}: unknown rubric_version "${data.rubric_version}"`);
      continue;
    }
    scenarios.push(data);
  }

  const incidents: IncidentContentFile[] = [];
  const slugs = new Set<string>();
  for (const { file, data } of sources.incidents) {
    if (!isIncidentContentFile(data)) {
      problems.push(`${file}: not a valid incident content file`);
      continue;
    }
    if (slugs.has(data.slug)) {
      problems.push(`${file}: duplicate incident slug "${data.slug}"`);
      continue;
    }
    slugs.add(data.slug);
    incidents.push(data);
  }

  if (problems.length > 0) {
    throw new ContentBundleError(problems);
  }

  const byKey = (a: string, b: string): number => a.localeCompare(b);
  return {
    generatedAt,
    scenarios: scenarios.sort((a, b) => byKey(`${a.id}@${a.version}`, `${b.id}@${b.version}`)),
    rubrics: rubrics.sort((a, b) => byKey(a.version, b.version)),
    incidents: incidents.sort((a, b) => byKey(a.slug, b.slug)),
  };
}
