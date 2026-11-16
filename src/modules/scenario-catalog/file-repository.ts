/**
 * Node-only file-backed scenario repository (local server and build scripts).
 * Never import this from the Worker entry or `src/app.ts`.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ScenarioContentFile } from "../../types/index.js";
import { InMemoryScenarioRepository, type ScenarioRepository } from "./index.js";
import { isScenarioContentFile } from "./guards.js";

const DEFAULT_SCENARIOS_DIRECTORY = path.resolve(process.cwd(), "content/scenarios");

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/**
 * Reads every valid scenario file under `content/scenarios/`. Versions are
 * keyed by the `id` and `version` fields inside each file, not by file name.
 */
export class FileScenarioRepository implements ScenarioRepository {
  public constructor(private readonly scenariosDirectory = DEFAULT_SCENARIOS_DIRECTORY) {}

  public async listPublished(): Promise<ScenarioContentFile[]> {
    return (await this.load()).listPublished();
  }

  public async getById(id: string): Promise<ScenarioContentFile | null> {
    return (await this.load()).getById(id);
  }

  public async getVersion(id: string, version: string): Promise<ScenarioContentFile | null> {
    return (await this.load()).getVersion(id, version);
  }

  /** Every valid scenario version found on disk. */
  public async listAllVersions(): Promise<ScenarioContentFile[]> {
    let entries;
    try {
      entries = await readdir(this.scenariosDirectory, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const scenarios = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && path.extname(entry.name) === ".json")
        .map((entry) => readScenarioFile(path.join(this.scenariosDirectory, entry.name))),
    );
    return scenarios.filter((scenario): scenario is ScenarioContentFile => scenario !== null);
  }

  private async load(): Promise<InMemoryScenarioRepository> {
    return new InMemoryScenarioRepository(await this.listAllVersions());
  }
}

async function readScenarioFile(filePath: string): Promise<ScenarioContentFile | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return isScenarioContentFile(parsed) ? parsed : null;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    if (isNodeError(error) && (error.code === "ENOENT" || error.code === "EISDIR")) {
      return null;
    }
    throw error;
  }
}
