/** Pure helpers for the incident detail page (no node:fs; safe for tests). */
import type { IncidentSource } from "./content";

export type Confidence = "fact" | "inference" | "teaching simplification" | "unknown";

export function normalizeConfidence(value: unknown): Confidence {
  if (typeof value !== "string") return "unknown";
  const v = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (v === "fact" || v === "inference" || v === "teaching simplification") return v;
  return "unknown";
}

/** Only http(s) URLs may be rendered as links. */
export function safeHttpUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

const OFFSET_RE = /(Z|[+-]\d{2}:\d{2})$/;

/** Returns ISO 8601 with date, time and UTC offset, or null if unparseable. */
export function toIsoTimestamp(occurredAt: unknown, tzOffset: unknown): string | null {
  if (typeof occurredAt !== "string") return null;
  const offset =
    typeof tzOffset === "string" && /^[+-]\d{2}:\d{2}$/.test(tzOffset) ? tzOffset : "+00:00";
  let s = occurredAt.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T00:00:00`;
  if (/T\d{2}:\d{2}$/.test(s)) s = `${s}:00`;
  if (!OFFSET_RE.test(s)) s = `${s}${offset}`;
  return Number.isNaN(Date.parse(s)) ? null : s;
}

export interface TimelineView {
  iso: string | null;
  raw: string;
  description: string;
  confidence: Confidence;
  sourceRef: string;
  sourceUrl: string | null;
  seq: number;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function matchSourceUrl(ref: string, sources: IncidentSource[]): string | null {
  if (!ref) return null;
  const direct = safeHttpUrl(ref);
  if (direct) return direct;
  const m = sources.find((s) => s.publisher === ref && safeHttpUrl(s.url));
  return m ? safeHttpUrl(m.url) : null;
}

/** Ascending by occurred_at, ties by sequence_pos. */
export function buildTimeline(
  events: Record<string, unknown>[],
  sources: IncidentSource[],
): TimelineView[] {
  const views = events.map((e, i): TimelineView => {
    const ref = str(e["source_ref"]) || str(e["evidence"]);
    const seq = typeof e["sequence_pos"] === "number" ? e["sequence_pos"] : i;
    return {
      iso: toIsoTimestamp(e["occurred_at"], e["tz_offset"]),
      raw: str(e["occurred_at"]),
      description: str(e["description"]),
      confidence: normalizeConfidence(e["confidence"]),
      sourceRef: ref,
      sourceUrl: matchSourceUrl(ref, sources),
      seq,
    };
  });
  const ms = (v: TimelineView): number => (v.iso ? Date.parse(v.iso) : Number.POSITIVE_INFINITY);
  return views.sort((a, b) => {
    const ta = ms(a);
    const tb = ms(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.seq - b.seq;
  });
}
