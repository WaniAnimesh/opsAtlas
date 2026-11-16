/** Cloudflare D1 adapter for the scoring `AssessmentRepository` port (design D3). */
import type { D1Database } from "../../types/d1.js";
import type { AssessmentRecord, AssessmentRepository } from "./index.js";

interface AssessmentRow {
  id: string;
  session_id: string;
  rubric_version: string;
  impact_control: number;
  diagnostic_quality: number;
  risk_management: number;
  recovery_quality: number;
  communication: number;
  learning_reflection: number;
  feedback_json: string;
  computed_at: string;
}

const COLUMNS =
  "id, session_id, rubric_version, impact_control, diagnostic_quality, risk_management, recovery_quality, communication, learning_reflection, feedback_json, computed_at";

function toRecord(row: AssessmentRow): AssessmentRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    rubricVersion: row.rubric_version,
    impactControl: row.impact_control,
    diagnosticQuality: row.diagnostic_quality,
    riskManagement: row.risk_management,
    recoveryQuality: row.recovery_quality,
    communication: row.communication,
    learningReflection: row.learning_reflection,
    feedback: JSON.parse(row.feedback_json) as AssessmentRecord["feedback"],
    computedAt: row.computed_at,
  };
}

export class D1AssessmentRepository implements AssessmentRepository {
  public constructor(private readonly db: D1Database) {}

  public async getBySessionId(sessionId: string): Promise<AssessmentRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM assessments WHERE session_id = ?`)
      .bind(sessionId)
      .first<AssessmentRow>();
    return row === null ? null : toRecord(row);
  }

  /** Inserts unless the session already has a row, then returns the stored row. */
  public async saveIfAbsent(record: AssessmentRecord): Promise<AssessmentRecord> {
    const [, selected] = await this.db.batch<AssessmentRow>([
      this.db
        .prepare(
          `INSERT INTO assessments (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id) DO NOTHING`,
        )
        .bind(
          record.id,
          record.sessionId,
          record.rubricVersion,
          record.impactControl,
          record.diagnosticQuality,
          record.riskManagement,
          record.recoveryQuality,
          record.communication,
          record.learningReflection,
          JSON.stringify(record.feedback),
          record.computedAt,
        ),
      this.db
        .prepare(`SELECT ${COLUMNS} FROM assessments WHERE session_id = ?`)
        .bind(record.sessionId),
    ]);
    const row = selected?.results[0];
    if (row === undefined) {
      throw new Error("Assessment row missing after insert.");
    }
    return toRecord(row);
  }
}
