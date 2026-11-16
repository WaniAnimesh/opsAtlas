/** Build-time lookup of the scenario linked to an incident (server-only: node:fs). */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export interface LinkedScenario {
  id: string;
  title: string;
}

export function getScenariosDir(): string {
  return path.resolve(process.cwd(), "../../content/scenarios");
}

export function findScenarioForIncident(
  slug: string,
  dir: string = getScenariosDir(),
): LinkedScenario | null {
  let files: string[];
  try {
    files = readdirSync(dir).sort();
  } catch {
    return null;
  }
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const p = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Record<string, unknown> | null;
      if (p && p["incident_slug"] === slug && typeof p["id"] === "string" && ID_PATTERN.test(p["id"])) {
        return { id: p["id"], title: typeof p["title"] === "string" ? p["title"] : p["id"] };
      }
    } catch {
      // skip malformed
    }
  }
  return null;
}
