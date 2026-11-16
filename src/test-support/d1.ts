/**
 * In-memory Cloudflare D1 for tests, backed by Miniflare (the same workerd
 * SQLite engine as production). No `wrangler.toml` is required.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database } from "../types/d1.js";

const MIGRATIONS_DIR = resolve(process.cwd(), "db/migrations");

/**
 * Splits a migration into statements. Comment-only lines are dropped and a
 * `CREATE TRIGGER ... BEGIN ... END;` body is kept in one piece.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current: string[] = [];
  let inTrigger = false;

  for (const rawLine of sql.split(/\r?\n/)) {
    const line = rawLine.replace(/--.*$/, "").trimEnd();
    if (line.trim() === "") continue;
    if (/^\s*CREATE\s+TRIGGER/i.test(line)) inTrigger = true;
    current.push(line);
    const ends = inTrigger ? /^\s*END\s*;\s*$/i.test(line) : /;\s*$/.test(line);
    if (ends) {
      statements.push(current.join("\n"));
      current = [];
      inTrigger = false;
    }
  }
  if (current.length > 0) statements.push(current.join("\n"));
  return statements;
}

export interface TestD1 {
  db: D1Database;
  /** Deletes all rows so one Miniflare instance can serve a whole test file. */
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

export async function createTestD1(): Promise<TestD1> {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "test-db" },
    }),
  );
  const db = (await mf.getD1Database("DB")) as unknown as D1Database;

  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const statement of splitSqlStatements(readFileSync(join(MIGRATIONS_DIR, file), "utf8"))) {
      await db.prepare(statement).run();
    }
  }

  return {
    db,
    reset: async (): Promise<void> => {
      await db.batch([
        db.prepare("DELETE FROM assessments"),
        db.prepare("DELETE FROM session_events"),
        db.prepare("DELETE FROM scenario_sessions"),
        db.prepare("DELETE FROM scenario_versions"),
      ]);
    },
    dispose: (): Promise<void> => mf.dispose(),
  };
}
