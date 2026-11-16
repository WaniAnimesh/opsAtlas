/**
 * Scenario Catalog: runtime-neutral (no `node:*` imports).
 *
 * The file-backed repository lives in `file-repository.ts` and is used only
 * by the Node server and build scripts. The Worker uses `BundledScenarioRepository`.
 */
import type { ContentBundle } from "../../content/bundle.js";
import type { ScenarioContentFile, ScenarioDifficulty } from "../../types/index.js";
import { SCENARIO_ID_PATTERN, compareSemver, latestPerId } from "./guards.js";

export {
  SCENARIO_ID_PATTERN,
  compareSemver,
  isScenarioContentFile,
  latestPerId,
} from "./guards.js";

/** The public scenario fields used by the catalog and scenario brief pages. */
export interface ScenarioCatalogEntry {
  id: string;
  incident_slug: string;
  title: string;
  objective: string;
  difficulty: ScenarioDifficulty;
  est_duration_min: number;
  skill_tags: string[];
  version: string;
}

/** A catalog entry contains all fields needed to render a scenario brief. */
export type ScenarioSummary = ScenarioCatalogEntry;
export type ScenarioBrief = ScenarioCatalogEntry;

/**
 * Repository boundary for scenario catalog storage.
 *
 * `listPublished` and `getById` return the highest semver version per id;
 * older versions are reachable only through `getVersion` (pinned sessions).
 */
export interface ScenarioRepository {
  listPublished(): Promise<ScenarioContentFile[]>;
  getById(id: string): Promise<ScenarioContentFile | null>;
  getVersion(id: string, version: string): Promise<ScenarioContentFile | null>;
}

/** Public service contract consumed by the API and frontend layers. */
export interface ScenarioCatalogService {
  listPublished(): Promise<ScenarioSummary[]>;
  getScenarioBrief(id: string): Promise<ScenarioBrief | null>;
}

function toCatalogEntry(scenario: ScenarioContentFile): ScenarioCatalogEntry {
  return {
    id: scenario.id,
    incident_slug: scenario.incident_slug,
    title: scenario.title,
    objective: scenario.objective,
    difficulty: scenario.difficulty,
    est_duration_min: scenario.est_duration_min,
    skill_tags: [...scenario.skill_tags],
    version: scenario.version,
  };
}

/** Repository over an in-memory list of every published scenario version. */
export class InMemoryScenarioRepository implements ScenarioRepository {
  private readonly scenarios: ScenarioContentFile[];

  public constructor(scenarios: readonly ScenarioContentFile[]) {
    this.scenarios = scenarios.map((scenario) => structuredClone(scenario));
  }

  public async listPublished(): Promise<ScenarioContentFile[]> {
    return latestPerId(this.scenarios).map((scenario) => structuredClone(scenario));
  }

  public async getById(id: string): Promise<ScenarioContentFile | null> {
    const versions = this.scenarios.filter((scenario) => scenario.id === id);
    const latest = versions.reduce<ScenarioContentFile | null>(
      (best, scenario) =>
        best === null || compareSemver(scenario.version, best.version) > 0 ? scenario : best,
      null,
    );
    return latest === null ? null : structuredClone(latest);
  }

  public async getVersion(id: string, version: string): Promise<ScenarioContentFile | null> {
    const match = this.scenarios.find(
      (scenario) => scenario.id === id && scenario.version === version,
    );
    return match === undefined ? null : structuredClone(match);
  }
}

/** Scenario repository over the build-time content bundle (Worker). */
export class BundledScenarioRepository extends InMemoryScenarioRepository {
  public constructor(bundle: Pick<ContentBundle, "scenarios">) {
    super(bundle.scenarios);
  }
}

/** Public service that maps repository content to catalog entries. */
export class ScenarioCatalog implements ScenarioCatalogService {
  public constructor(private readonly repository: ScenarioRepository) {}

  public async listPublished(): Promise<ScenarioSummary[]> {
    const scenarios = await this.repository.listPublished();
    return scenarios.map(toCatalogEntry);
  }

  public async getScenarioBrief(id: string): Promise<ScenarioBrief | null> {
    if (!SCENARIO_ID_PATTERN.test(id)) {
      return null;
    }

    const scenario = await this.repository.getById(id);
    return scenario === null ? null : toCatalogEntry(scenario);
  }
}

export function createScenarioCatalogService(
  repository: ScenarioRepository,
): ScenarioCatalogService {
  return new ScenarioCatalog(repository);
}
