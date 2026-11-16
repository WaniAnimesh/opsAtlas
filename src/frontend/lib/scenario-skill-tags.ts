/**
 * Build-time (server-only) loader: skill tags per scenario id, read from
 * content/scenarios/*.json. Uses node:fs, so import it only from server
 * components. The result is embedded in the static /learning page.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function getScenariosDir(): string {
  return path.resolve(process.cwd(), "../../content/scenarios");
}

/** Union of skill tags across all published versions of each scenario. */
export function readScenarioSkillTags(dir: string = getScenariosDir()): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return out;
  }
  for (const name of names.sort()) {
    try {
      const parsed = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as {
        id?: unknown;
        skill_tags?: unknown;
      } | null;
      if (typeof parsed?.id !== "string" || !Array.isArray(parsed.skill_tags)) continue;
      const tags = parsed.skill_tags.filter((t): t is string => typeof t === "string" && t !== "");
      out[parsed.id] = [...new Set([...(out[parsed.id] ?? []), ...tags])];
    } catch {
      // unreadable or malformed file: skip
    }
  }
  return out;
}
