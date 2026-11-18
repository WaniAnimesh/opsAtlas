import Link from "next/link";
import type { ReactNode } from "react";
import type { Connection, RelatedGroups } from "../../../lib/atlas/graph";
import {
  DIFFICULTY_LABEL,
  entityHref,
  journeyHref,
  layerHref,
  sectionHeading,
  TYPE_META,
} from "../../../lib/atlas/meta";
import { SECTION_KEYS, type AtlasEntity, type Journey, type Layer, type SectionKey } from "../../../lib/atlas/types";
import { Breadcrumbs, CardGrid, EntityCard, PageHeader, TextBlock, TypeBadge } from "./primitives";

export interface IncidentLink {
  slug: string;
  title: string;
}

export interface EntityViewProps {
  entity: AtlasEntity;
  layer: Layer;
  secondaryLayers: Layer[];
  related: RelatedGroups;
  /** Lookup for neighbour entities referenced by connections and criteria. */
  lookup: Record<string, Pick<AtlasEntity, "id" | "type" | "title" | "description" | "question">>;
  journeys: Journey[];
  incidents: IncidentLink[];
}

/** Sections rendered before the tradeoff matrix; the rest follow it. */
const BEFORE_TRADEOFFS: ReadonlySet<SectionKey> = new Set<SectionKey>([
  "overview",
  "context",
  "assumptions",
  "challenge",
  "constraints",
  "facts",
  "causes",
  "progression",
  "warningSigns",
  "whenToUse",
  "whenNotToUse",
  "alternatives",
]);

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }): ReactNode {
  return (
    <section aria-labelledby={`${id}-h`} className="mt-8">
      <h2 id={`${id}-h`} className="mb-2 text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ContentSections({ entity, keys }: { entity: AtlasEntity; keys: SectionKey[] }): ReactNode {
  return (
    <>
      {keys.map((k) => {
        const v = entity.sections[k];
        if (v === undefined) return null;
        return (
          <Section key={k} id={k} title={sectionHeading(entity.type, k)}>
            <TextBlock value={v} />
          </Section>
        );
      })}
    </>
  );
}

function TradeoffTable({ entity }: { entity: AtlasEntity }): ReactNode {
  const t = entity.tradeoffs;
  if (!t) return null;
  return (
    <Section id="tradeoffs" title="Tradeoff analysis">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-sm" data-testid="tradeoff-table">
          <caption className="sr-only">Tradeoffs for {entity.title} across standard evaluation dimensions</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-border p-2 text-left">
                Dimension
              </th>
              {t.options.map((o) => (
                <th key={o} scope="col" className="border-b border-border p-2 text-left">
                  {o}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.dimension} className="align-top">
                <th scope="row" className="border-b border-border p-2 text-left font-medium">
                  {r.dimension}
                </th>
                {r.values.map((v, i) => (
                  <td key={`${r.dimension}-${i}`} className="border-b border-border p-2">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Guidance({ entity }: { entity: AtlasEntity }): ReactNode {
  if (!entity.guidance || entity.guidance.length === 0) return null;
  return (
    <Section id="guidance" title="When to choose each option">
      <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
        {entity.guidance.map((g) => (
          <li key={g.option} className="rounded-md border border-border bg-surface p-4">
            <h3 className="m-0 text-base font-semibold">{g.option}</h3>
            <p className="mt-2 mb-0 text-sm font-medium text-success">Choose when</p>
            <TextBlock value={g.chooseWhen} />
            {g.avoidWhen && g.avoidWhen.length > 0 ? (
              <>
                <p className="mt-2 mb-0 text-sm font-medium text-danger">Avoid when</p>
                <TextBlock value={g.avoidWhen} />
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Criteria({ entity, lookup }: Pick<EntityViewProps, "entity" | "lookup">): ReactNode {
  if (!entity.criteria || entity.criteria.length === 0) return null;
  return (
    <Section id="criteria" title="Assessment criteria">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <caption className="sr-only">Assessment criteria for {entity.title}</caption>
          <thead>
            <tr>
              {["Area", "Question", "Healthy signal", "Risk signal", "Explore"].map((h) => (
                <th key={h} scope="col" className="border-b border-border p-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entity.criteria.map((c) => (
              <tr key={c.area} className="align-top">
                <th scope="row" className="border-b border-border p-2 text-left font-medium">
                  {c.area}
                </th>
                <td className="border-b border-border p-2">{c.question}</td>
                <td className="border-b border-border p-2">{c.healthy}</td>
                <td className="border-b border-border p-2">{c.risk}</td>
                <td className="border-b border-border p-2">
                  <ul className="m-0 grid list-none gap-1 p-0">
                    {(c.explore ?? []).map((id) => {
                      const e = lookup[id];
                      return e ? (
                        <li key={id}>
                          <Link href={entityHref(e)} className="text-accent underline-offset-4 hover:underline">
                            {e.title}
                          </Link>
                        </li>
                      ) : null;
                    })}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function RelatedSection({
  id,
  title,
  conns,
  lookup,
}: {
  id: string;
  title: string;
  conns: Connection[];
  lookup: EntityViewProps["lookup"];
}): ReactNode {
  if (conns.length === 0) return null;
  return (
    <Section id={id} title={title}>
      <CardGrid>
        {conns.map((c) => {
          const e = lookup[c.other];
          if (!e) return null;
          return <EntityCard key={`${id}-${c.edge.id}`} entity={e} label={c.label} {...(c.edge.note ? { note: c.edge.note } : {})} />;
        })}
      </CardGrid>
    </Section>
  );
}

function JourneyContext({ entity, journeys, lookup }: Pick<EntityViewProps, "entity" | "journeys" | "lookup">): ReactNode {
  if (journeys.length === 0) return null;
  return (
    <Section id="journeys" title="Decision journeys through this page">
      <ul className="grid list-none gap-3 p-0">
        {journeys.map((j) => {
          const idx = j.steps.findIndex((s) => s.entity === entity.id);
          const next = j.steps[idx + 1];
          const nextEntity = next ? lookup[next.entity] : undefined;
          return (
            <li key={j.id} className="rounded-md border border-border bg-surface p-4">
              <p className="m-0 text-sm text-muted">
                Step {idx + 1} of {j.steps.length} in{" "}
                <Link href={journeyHref(j.id)} className="text-accent underline-offset-4 hover:underline">
                  {j.title}
                </Link>
              </p>
              {next && nextEntity ? (
                <p className="mt-2 mb-0">
                  Next:{" "}
                  <Link href={entityHref(nextEntity)} className="font-medium text-accent underline-offset-4 hover:underline">
                    {nextEntity.title}
                  </Link>{" "}
                  <span className="text-muted">— {next.why}</span>
                </p>
              ) : (
                <p className="mt-2 mb-0 text-muted">This is the last step of the journey.</p>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function EntityView({ entity, layer, secondaryLayers, related, lookup, journeys, incidents }: EntityViewProps): ReactNode {
  const meta = TYPE_META[entity.type];
  const before = SECTION_KEYS.filter((k) => BEFORE_TRADEOFFS.has(k));
  const after = SECTION_KEYS.filter((k) => !BEFORE_TRADEOFFS.has(k));

  return (
    <article>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: layer.title, href: layerHref(layer.id) },
          { label: meta.plural, href: `/${meta.section}/` },
          { label: entity.title },
        ]}
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0">
          <PageHeader eyebrow={<TypeBadge type={entity.type} />} title={entity.title} lead={entity.description}>
            {entity.question ? (
              <p className="mt-4 mb-0 rounded-md border-l-4 border-accent bg-surface p-3 text-lg font-medium" data-testid="decision-question">
                <span className="sr-only">Decision question: </span>
                {entity.question}
              </p>
            ) : null}
          </PageHeader>

          <ContentSections entity={entity} keys={before} />
          <TradeoffTable entity={entity} />
          <Guidance entity={entity} />
          <Criteria entity={entity} lookup={lookup} />
          <ContentSections entity={entity} keys={after} />

          {incidents.length > 0 ? (
            <Section id="incidents" title="Real incidents in the OpsAtlas library">
              <ul className="grid list-none gap-2 p-0">
                {incidents.map((i) => (
                  <li key={i.slug}>
                    <Link href={`/atlas/incidents/${i.slug}/`} className="text-accent underline-offset-4 hover:underline">
                      {i.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <RelatedSection id="rel-decisions" title="Related decisions" conns={related.decisions} lookup={lookup} />
          <RelatedSection id="rel-technologies" title="Related technologies" conns={related.technologies} lookup={lookup} />
          <RelatedSection id="rel-patterns" title="Related patterns" conns={related.patterns} lookup={lookup} />
          <RelatedSection id="rel-failures" title="Related failure patterns" conns={related.failures} lookup={lookup} />
          <RelatedSection id="rel-concepts" title="Foundational concepts" conns={related.concepts} lookup={lookup} />
          <RelatedSection id="rel-frameworks" title="Related frameworks" conns={related.frameworks} lookup={lookup} />
          <RelatedSection id="rel-cases" title="Case studies" conns={related.caseStudies} lookup={lookup} />
          <RelatedSection id="rel-reviews" title="Architecture reviews" conns={related.reviews} lookup={lookup} />
          <JourneyContext entity={entity} journeys={journeys} lookup={lookup} />
          <RelatedSection id="next" title="What to explore next" conns={related.next} lookup={lookup} />

          {entity.sources && entity.sources.length > 0 ? (
            <Section id="sources" title="Sources and references">
              <ul className="grid gap-1 pl-5">
                {entity.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} rel="noopener noreferrer" className="text-accent underline-offset-4 hover:underline">
                      {s.title}
                    </a>
                    {s.publisher ? <span className="text-muted"> · {s.publisher}</span> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>

        <aside aria-label="Page details" className="lg:sticky lg:top-4 lg:self-start">
          <dl className="m-0 grid gap-3 rounded-md border border-border bg-surface p-4 text-sm">
            <div>
              <dt className="font-medium">Type</dt>
              <dd className="m-0 text-muted">{meta.label}</dd>
            </div>
            <div>
              <dt className="font-medium">Domain</dt>
              <dd className="m-0">
                <Link href={layerHref(layer.id)} className="text-accent underline-offset-4 hover:underline">
                  {layer.number}. {layer.title}
                </Link>
              </dd>
            </div>
            {secondaryLayers.length > 0 ? (
              <div>
                <dt className="font-medium">Also in</dt>
                <dd className="m-0">
                  <ul className="m-0 grid list-none gap-0.5 p-0">
                    {secondaryLayers.map((l) => (
                      <li key={l.id}>
                        <Link href={layerHref(l.id)} className="text-accent underline-offset-4 hover:underline">
                          {l.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="font-medium">Depth</dt>
              <dd className="m-0 text-muted">{DIFFICULTY_LABEL[entity.difficulty]}</dd>
            </div>
            <div>
              <dt className="font-medium">Last reviewed</dt>
              <dd className="m-0 text-muted">
                <time dateTime={entity.lastReviewed}>{entity.lastReviewed}</time>
              </dd>
            </div>
            {entity.tags.length > 0 ? (
              <div>
                <dt className="font-medium">Tags</dt>
                <dd className="m-0 flex flex-wrap gap-1">
                  {entity.tags.map((t) => (
                    <span key={t} className="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-xs">
                      {t}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-3 mb-0">
            <Link
              href={`/graph/?focus=${entity.id}`}
              className="inline-block rounded-md border border-accent px-3 py-2 text-sm font-semibold text-accent no-underline"
            >
              View in knowledge graph
            </Link>
          </p>
        </aside>
      </div>
    </article>
  );
}
