import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Reads each *.json in `dir` and returns its embedded `id` (skipping invalid ones). */
export function readScenarioIds(dir: string): string[] {
  const ids: string[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed: unknown = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
      const id = (parsed as { id?: unknown } | null)?.id;
      if (typeof id === "string" && ID_PATTERN.test(id) && !ids.includes(id)) {
        ids.push(id);
      }
    } catch {
      // unreadable or malformed file: skip
    }
  }
  return ids;
}
