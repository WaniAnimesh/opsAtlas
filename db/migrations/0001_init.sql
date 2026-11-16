-- OpsAtlas D1 schema (SQLite). Dynamic session data only.
-- Timestamps are ISO 8601 UTC strings (Date.toISOString()).
-- Applied with `wrangler d1 migrations apply opsatlas`. Migrations must stay
-- backward compatible with the currently deployed Worker (additive only).
PRAGMA foreign_keys = ON;

-- Immutable snapshot of each scenario version used by at least one session.
CREATE TABLE scenario_versions (
    scenario_id     TEXT NOT NULL,
    version         TEXT NOT NULL,
    rubric_version  TEXT NOT NULL,
    definition_json TEXT NOT NULL,          -- full ScenarioContentFile JSON
    created_at      TEXT NOT NULL,
    PRIMARY KEY (scenario_id, version)
);

CREATE TABLE scenario_sessions (
    id               TEXT PRIMARY KEY CHECK (length(id) = 43),   -- Session_Key
    scenario_id      TEXT NOT NULL,
    scenario_version TEXT NOT NULL,
    rubric_version   TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','paused','completed','abandoned','timed_out')),
    started_at       TEXT NOT NULL,
    paused_at        TEXT,
    ended_at         TEXT,
    sim_time_elapsed INTEGER NOT NULL DEFAULT 0 CHECK (sim_time_elapsed >= 0),
    last_activity_at TEXT NOT NULL,
    FOREIGN KEY (scenario_id, scenario_version)
        REFERENCES scenario_versions (scenario_id, version)
);

CREATE TABLE session_events (
    id                  TEXT PRIMARY KEY,
    session_id          TEXT NOT NULL REFERENCES scenario_sessions (id) ON DELETE CASCADE,
    sequence_pos        INTEGER NOT NULL CHECK (sequence_pos >= 0),
    sim_time            INTEGER NOT NULL CHECK (sim_time >= 0),
    event_type          TEXT NOT NULL CHECK (event_type IN
                        ('initial_state','action','evidence_request','pause','resume','abandon','timeout')),
    payload_json        TEXT NOT NULL,
    state_snapshot_json TEXT NOT NULL,
    wall_time           TEXT NOT NULL,
    UNIQUE (session_id, sequence_pos)
);

-- Append-only journal: rows may be inserted and deleted (purge cascade) but never updated.
CREATE TRIGGER session_events_no_update
BEFORE UPDATE ON session_events
BEGIN
    SELECT RAISE(ABORT, 'session_events is append-only');
END;

CREATE TABLE assessments (
    id                  TEXT PRIMARY KEY,
    session_id          TEXT NOT NULL UNIQUE REFERENCES scenario_sessions (id) ON DELETE CASCADE,
    rubric_version      TEXT NOT NULL,
    impact_control      REAL NOT NULL,
    diagnostic_quality  REAL NOT NULL,
    risk_management     REAL NOT NULL,
    recovery_quality    REAL NOT NULL,
    communication       REAL NOT NULL,
    learning_reflection REAL NOT NULL,
    feedback_json       TEXT NOT NULL,
    computed_at         TEXT NOT NULL
);

CREATE INDEX idx_sessions_last_activity ON scenario_sessions (last_activity_at);
