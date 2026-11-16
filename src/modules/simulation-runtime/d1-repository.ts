/**
 * Cloudflare D1 adapter for the Simulation Runtime storage port, plus the
 * inactive-session purge job (design D3, "D1 Adapters" and "Purge Job").
 *
 * D1 has no interactive transactions. `db.batch()` runs its statements
 * atomically, which gives the same "event and session row together or not at
 * all" guarantee as the in-memory adapter. All statements use bound parameters.
 * `last_activity_at` is maintained here; the domain `SessionRecord` is unchanged.
 */
import { sessionConflict } from "../../api/errors.js";
import type { D1Database, D1PreparedStatement } from "../../types/d1.js";
import type { ScenarioContentFile, ScenarioState } from "../../types/index.js";
import { SimulationRuntimeError } from "./index.js";
import type {
  SessionEvent,
  SessionEventType,
  SessionRecord,
  SessionStatus,
  SimulationRuntimeRepository,
} from "./index.js";

interface SessionRow {
  id: string;
  scenario_id: string;
  scenario_version: string;
  rubric_version: string;
  status: SessionStatus;
  started_at: string;
  paused_at: string | null;
  ended_at: string | null;
  sim_time_elapsed: number;
}

interface EventRow {
  id: string;
  session_id: string;
  sequence_pos: number;
  sim_time: number;
  event_type: SessionEventType;
  payload_json: string;
  state_snapshot_json: string;
  wall_time: string;
}

const SESSION_COLUMNS =
  "id, scenario_id, scenario_version, rubric_version, status, started_at, paused_at, ended_at, sim_time_elapsed";
const EVENT_COLUMNS =
  "id, session_id, sequence_pos, sim_time, event_type, payload_json, state_snapshot_json, wall_time";

/** Matches the SQLite message for UNIQUE (session_id, sequence_pos) violations. */
const SEQUENCE_CONFLICT =
  /UNIQUE constraint failed: session_events\.session_id, session_events\.sequence_pos/;

function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    scenarioVersion: row.scenario_version,
    rubricVersion: row.rubric_version,
    status: row.status,
    startedAt: row.started_at,
    ...(row.paused_at === null ? {} : { pausedAt: row.paused_at }),
    ...(row.ended_at === null ? {} : { endedAt: row.ended_at }),
    simTimeElapsed: row.sim_time_elapsed,
  };
}

function toEvent(row: EventRow): SessionEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    sequencePos: row.sequence_pos,
    simTime: row.sim_time,
    eventType: row.event_type,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    stateSnapshot: JSON.parse(row.state_snapshot_json) as ScenarioState,
    wallTime: row.wall_time,
  };
}

export interface D1RepositoryOptions {
  /** Source of `last_activity_at` and snapshot `created_at` timestamps. */
  clock?: () => Date;
}

export class D1SimulationRuntimeRepository implements SimulationRuntimeRepository {
  private readonly clock: () => Date;

  public constructor(
    private readonly db: D1Database,
    options: D1RepositoryOptions = {},
  ) {
    this.clock = options.clock ?? ((): Date => new Date());
  }

  public async saveScenarioVersion(scenario: ScenarioContentFile): Promise<void> {
    // First write wins: a published version is immutable.
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO scenario_versions (scenario_id, version, rubric_version, definition_json, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        scenario.id,
        scenario.version,
        scenario.rubric_version,
        JSON.stringify(scenario),
        this.now(),
      )
      .run();
  }

  public async getScenarioVersion(
    scenarioId: string,
    version: string,
  ): Promise<ScenarioContentFile | null> {
    const row = await this.db
      .prepare(
        "SELECT definition_json FROM scenario_versions WHERE scenario_id = ? AND version = ?",
      )
      .bind(scenarioId, version)
      .first<{ definition_json: string }>();
    return row === null ? null : (JSON.parse(row.definition_json) as ScenarioContentFile);
  }

  public async createSession(session: SessionRecord, initialEvent: SessionEvent): Promise<void> {
    await this.batch([
      this.db
        .prepare(
          "INSERT INTO scenario_sessions (id, scenario_id, scenario_version, rubric_version, status, started_at, paused_at, ended_at, sim_time_elapsed, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          session.id,
          session.scenarioId,
          session.scenarioVersion,
          session.rubricVersion,
          session.status,
          session.startedAt,
          session.pausedAt ?? null,
          session.endedAt ?? null,
          session.simTimeElapsed,
          session.startedAt,
        ),
      this.insertEvent(initialEvent),
    ]);
  }

  public async getSession(sessionId: string): Promise<SessionRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${SESSION_COLUMNS} FROM scenario_sessions WHERE id = ?`)
      .bind(sessionId)
      .first<SessionRow>();
    return row === null ? null : toSession(row);
  }

  public async listEvents(sessionId: string): Promise<SessionEvent[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${EVENT_COLUMNS} FROM session_events WHERE session_id = ? ORDER BY sequence_pos`,
      )
      .bind(sessionId)
      .all<EventRow>();
    return results.map(toEvent);
  }

  public async appendEvent(event: SessionEvent): Promise<void> {
    await this.batch([
      this.insertEvent(event),
      this.db
        .prepare("UPDATE scenario_sessions SET last_activity_at = ? WHERE id = ?")
        .bind(this.now(), event.sessionId),
    ]);
  }

  public async updateSession(session: SessionRecord): Promise<void> {
    await this.updateStatement(session).run();
  }

  public async appendEventAndUpdateSession(
    event: SessionEvent,
    session: SessionRecord,
  ): Promise<void> {
    await this.batch([this.insertEvent(event), this.updateStatement(session)]);
  }

  private now(): string {
    return this.clock().toISOString();
  }

  private insertEvent(event: SessionEvent): D1PreparedStatement {
    return this.db
      .prepare(`INSERT INTO session_events (${EVENT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        event.id,
        event.sessionId,
        event.sequencePos,
        event.simTime,
        event.eventType,
        JSON.stringify(event.payload),
        JSON.stringify(event.stateSnapshot),
        event.wallTime,
      );
  }

  private updateStatement(session: SessionRecord): D1PreparedStatement {
    return this.db
      .prepare(
        "UPDATE scenario_sessions SET status = ?, paused_at = ?, ended_at = ?, sim_time_elapsed = ?, last_activity_at = ? WHERE id = ?",
      )
      .bind(
        session.status,
        session.pausedAt ?? null,
        session.endedAt ?? null,
        session.simTimeElapsed,
        this.now(),
        session.id,
      );
  }

  /** Atomic batch; maps a duplicate (session_id, sequence_pos) to 409 SESSION_CONFLICT. */
  private async batch(statements: D1PreparedStatement[]): Promise<void> {
    try {
      await this.db.batch(statements);
    } catch (error) {
      if (
        error instanceof Error &&
        SEQUENCE_CONFLICT.test(`${error.message} ${String(error.cause ?? "")}`)
      ) {
        throw new SimulationRuntimeError(sessionConflict());
      }
      throw error;
    }
  }
}

// ─── Purge job ────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const PURGE_BATCH_SIZE = 500;
const PURGE_MAX_BATCHES = 20;

export interface PurgeResult {
  deleted: number;
}

/**
 * Deletes sessions whose `last_activity_at` is older than `maxAgeDays`, in
 * batches of 500 up to a per-run cap, then removes `scenario_versions`
 * snapshots no session references. Events and assessments go with their
 * session through `ON DELETE CASCADE`. Logs counts only.
 */
export async function purgeInactiveSessions(
  db: D1Database,
  now: Date,
  maxAgeDays = 30,
): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - maxAgeDays * DAY_MS).toISOString();
  let deleted = 0;

  for (let batch = 0; batch < PURGE_MAX_BATCHES; batch += 1) {
    // `meta.changes` also counts cascaded event and assessment rows, so the
    // number of sessions is counted in the same atomic batch as the delete.
    const [counted] = await db.batch<{ n: number }>([
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM (SELECT id FROM scenario_sessions WHERE last_activity_at < ?1 LIMIT ?2)",
        )
        .bind(cutoff, PURGE_BATCH_SIZE),
      db
        .prepare(
          "DELETE FROM scenario_sessions WHERE id IN (SELECT id FROM scenario_sessions WHERE last_activity_at < ?1 LIMIT ?2)",
        )
        .bind(cutoff, PURGE_BATCH_SIZE),
    ]);
    const sessions = counted?.results[0]?.n ?? 0;
    deleted += sessions;
    if (sessions < PURGE_BATCH_SIZE) {
      break;
    }
  }

  await db
    .prepare(
      "DELETE FROM scenario_versions WHERE NOT EXISTS (SELECT 1 FROM scenario_sessions s WHERE s.scenario_id = scenario_versions.scenario_id AND s.scenario_version = scenario_versions.version)",
    )
    .run();

  console.info(`[OpsAtlas] Purged ${deleted} inactive session(s).`);
  return { deleted };
}
