import Link from "next/link";
import type { ReactNode } from "react";
import type { IncidentRecord } from "../../../../lib/content";
import {
  buildTimeline,
  normalizeConfidence,
  safeHttpUrl,
  type Confidence,
} from "../../../../lib/incident-detail";
import type { LinkedScenario } from "../../../../lib/linked-scenario";

export const RECONSTRUCTION_BANNER = "Educational Reconstruction \u2014 not a verbatim account";
export const NO_CONTENT = "No content available";

const CONFIDENCE_STYLE: Record<Confidence, { icon: string; border: string }> = {
  fact: { icon: "\u25CF", border: "border-solid" },
  inference: { icon: "\u25B2", border: "border-dashed" },
  "teaching simplification": { icon: "\u25C6", border: "border-dotted" },
  unknown: { icon: "?", border: "border-double" },
};

export function ConfidenceLabel({ value }: { value: unknown }): ReactNode {
  const c = normalizeConfidence(value);
  const s = CONFIDENCE_STYLE[c];
  return (
    <span
      role="img"
      aria-label={`Confidence: ${c}`}
      data-confidence={c}
      className={`inline-flex items-center gap-1 rounded border-2 border-border px-2 py-0.5 text-xs ${s.border}`}
    >
      <span aria-hidden="true">{s.icon}</span>
      <span>{c}</span>
    </span>
  );
}

function Empty(): ReactNode {
  return <p className="m-0 text-muted italic">{NO_CONTENT}</p>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }): ReactNode {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="mt-0 text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function textItems(v: unknown): string[] {
  if (typeof v === "string") return v.trim() ? [v] : [];
  if (!Array.isArray(v)) return [];
  return v
    .map((x) =>
      typeof x === "string"
        ? x
        : x && typeof x === "object"
          ? str((x as Record<string, unknown>)["description"]) ||
            str((x as Record<string, unknown>)["statement"])
          : "",
    )
    .filter((s) => s.trim() !== "");
}

function ExtLink({ href, children }: { href: string; children: ReactNode }): ReactNode {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
      {children}
    </a>
  );
}

export function IncidentDetail({
  incident,
  scenario,
}: {
  incident: IncidentRecord;
  scenario: LinkedScenario | null;
}): ReactNode {
  const extra = incident as unknown as Record<string, unknown>;
  const timeline = buildTimeline(incident.timeline, incident.sources);
  const arch = textItems(extra["architecture_context"]);
  const recovery = textItems(extra["recovery_steps"]);

  return (
    <article>
      {incident.is_reconstruction && (
        <div role="note" className="mb-4 rounded border-2 border-dashed border-border bg-surface p-3 font-semibold">
          {RECONSTRUCTION_BANNER}
        </div>
      )}
      <h1 className="mt-0 text-3xl font-semibold">{incident.title}</h1>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        <div className="flex gap-1">
          <dt>Organization:</dt>
          <dd className="m-0 text-fg">{incident.org}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Date:</dt>
          <dd className="m-0 text-fg">{incident.incident_date}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Severity:</dt>
          <dd className="m-0 text-fg">{incident.severity}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Failure domain:</dt>
          <dd className="m-0 text-fg">{incident.failure_domain}</dd>
        </div>
      </dl>

      {scenario && (
        <p className="mt-4">
          <Link
            href={`/simulator/${scenario.id}/brief/`}
            className="rounded border border-border px-3 py-1 text-accent underline"
          >
            Practice this incident in the simulator: {scenario.title}
          </Link>
        </p>
      )}

      <Section id="summary" title="Summary">
        {incident.summary.trim() ? <p className="m-0">{incident.summary}</p> : <Empty />}
      </Section>

      <Section id="architecture" title="Architecture context">
        {arch.length > 0 ? arch.map((t) => <p key={t}>{t}</p>) : <Empty />}
      </Section>

      <Section id="impact" title="Customer impact">
        {incident.impact.trim() ? <p className="m-0">{incident.impact}</p> : <Empty />}
      </Section>

      <Section id="causal" title="Causal factors">
        {incident.causal_factors.length > 0 ? (
          <ul className="m-0 list-none space-y-3 p-0">
            {incident.causal_factors.map((f, i) => (
              <li key={i}>
                <div className="flex flex-wrap items-center gap-2">
                  {str(f["factor_type"]) && <strong>{str(f["factor_type"])}</strong>}
                  <ConfidenceLabel value={f["confidence"]} />
                </div>
                <p className="m-0">{str(f["description"])}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>

      <Section id="recovery" title="Recovery steps">
        {recovery.length > 0 ? (
          <ol className="m-0 pl-6">
            {recovery.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        ) : (
          <Empty />
        )}
      </Section>

      <Section id="lessons" title="Lessons learned">
        {incident.lessons.length > 0 ? (
          <ul className="m-0 space-y-3 pl-6">
            {incident.lessons.map((l, i) => (
              <li key={i}>
                <p className="m-0">{str(l["statement"])}</p>
                {str(l["recommended_control"]) && (
                  <p className="m-0 text-sm text-muted">Recommended control: {str(l["recommended_control"])}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>

      <Section id="timeline" title="Timeline">
        {timeline.length > 0 ? (
          <ol className="m-0 list-none space-y-3 p-0">
            {timeline.map((e, i) => (
              <li key={i}>
                <div className="flex flex-wrap items-center gap-2">
                  {e.iso ? (
                    <time dateTime={e.iso} className="font-mono text-sm">
                      {e.iso}
                    </time>
                  ) : (
                    <span className="font-mono text-sm">{e.raw}</span>
                  )}
                  <ConfidenceLabel value={e.confidence} />
                </div>
                <p className="m-0">{e.description}</p>
                {e.sourceRef && (
                  <p className="m-0 text-sm text-muted">
                    Evidence:{" "}
                    {e.sourceUrl ? <ExtLink href={e.sourceUrl}>{e.sourceRef}</ExtLink> : e.sourceRef}
                  </p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <Empty />
        )}
      </Section>

      <Section id="sources" title="Sources">
        {incident.sources.length > 0 ? (
          <ul className="m-0 space-y-2 pl-6">
            {incident.sources.map((s, i) => {
              const href = safeHttpUrl(s.url);
              return (
                <li key={i}>
                  <span>{s.source_tier ? `${s.source_tier}` : "untiered"}</span>
                  {" \u2014 "}
                  {href ? <ExtLink href={href}>{s.publisher || href}</ExtLink> : <span>{s.publisher}{s.url ? `, ${s.url}` : ""}</span>}
                  {s.published_at && <span>{" ("}<time dateTime={s.published_at}>{s.published_at}</time>{")"}</span>}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>
    </article>
  );
}
