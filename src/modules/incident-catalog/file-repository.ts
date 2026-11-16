/**
 * Node-only file-backed incident repository (local server and build scripts).
 * Never import this from the Worker entry or `src/app.ts`.
 */
import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";

import type { IncidentContentFile } from "../../types/index.js";
import { INCIDENT_SLUG_PATTERN, isIncidentContentFile } from "./guards.js";
import {
  IncidentCatalog,
  type IncidentCatalogService,
  type IncidentDetail,
  type IncidentRepository,
} from "./index.js";

const DEFAULT_INCIDENTS_DIRECTORY = path.resolve(process.cwd(), "content/incidents");

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function parseIncidentFile(filePath: string): Promise<IncidentContentFile | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isIncidentContentFile(parsed) ? parsed : null;
  } catch (error: unknown) {
    if (isNodeError(error) && (error.code === "ENOENT" || error.code === "EISDIR")) {
      return null;
    }

    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

function safeIncidentPath(directory: string, slug: string): string | null {
  if (!INCIDENT_SLUG_PATTERN.test(slug)) {
    return null;
  }

  const resolvedDirectory = path.resolve(directory);
  const candidate = path.resolve(resolvedDirectory, `${slug}.json`);
  const relative = path.relative(resolvedDirectory, candidate);

  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    path.basename(candidate) !== `${slug}.json`
  ) {
    return null;
  }

  return candidate;
}

/** Reads valid incident JSON files from the repository content directory. */
export class FileIncidentRepository implements IncidentRepository {
  public constructor(private readonly incidentsDirectory: string = DEFAULT_INCIDENTS_DIRECTORY) {}

  public async listPublished(): Promise<IncidentDetail[]> {
    let entries;
    try {
      entries = await readdir(this.incidentsDirectory, { withFileTypes: true });
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return [];
      }

      throw error;
    }

    const incidents = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => parseIncidentFile(path.join(this.incidentsDirectory, entry.name))),
    );

    return incidents.filter((incident): incident is IncidentDetail => incident !== null);
  }

  public async getBySlug(slug: string): Promise<IncidentDetail | null> {
    const filePath = safeIncidentPath(this.incidentsDirectory, slug);
    if (filePath === null) {
      return null;
    }

    const incident = await parseIncidentFile(filePath);
    return incident !== null && incident.slug === slug ? incident : null;
  }
}

/** File-backed implementation used by local development and static builds. */
export class FileIncidentCatalogService extends IncidentCatalog {
  public constructor(incidentsDirectory = DEFAULT_INCIDENTS_DIRECTORY) {
    super(new FileIncidentRepository(incidentsDirectory));
  }
}

export function createIncidentCatalogService(incidentsDirectory?: string): IncidentCatalogService {
  return new FileIncidentCatalogService(incidentsDirectory);
}
