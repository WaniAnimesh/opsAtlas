import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Breadcrumbs, CardGrid, EntityCard, PageHeader } from "../../components/atlas/primitives";
import { connectionsOf } from "../../../lib/atlas/graph";
import { entitiesInLayer, getAtlas, journeysTouching } from "../../../lib/atlas/load";
import { entityHref, journeyHref, layerHref } from "../../../lib/atlas/meta";
import type { AtlasEntity, EntityType } from "../../../lib/atlas/types";

export const dynamicParams = false;

type Params = Promise<{ layer: string }>;

export function generateStaticParams(): { layer: string }[] {
  return getAtlas().layers.map((l) => ({ layer: l.id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { layer } = await params;
  const l = getAtlas().layerById.get(layer);
  if (!l) return { title: "Not found | OpsAtlas" };
  return {
    title: `${l.title} | OpsAtlas Decision Atlas`,
    description: l.purpose,
    alternates: { canonical: layerHref(l.id) },
  };
}

const GROUPS: { title: string; types: EntityType[] }[] = [
  { title: "Important decisions", types: ["decision", "comparison"] },
  { title: "Technologies", types: ["technology"] },
  { title: "Patterns and concepts", types: ["pattern", "concept"] },
  { title: "Failure patterns", types: ["failure-pattern"] },
  { title: "Frameworks, reviews and case studies", types: ["framework", "review", "case-study"] },
];

export default async function LayerPage({ params }: { params: Params }): Promise<ReactNode> {
  const { layer: layerId } = await params;
  const atlas = getAtlas();
  const layer = atlas.layerById.get(layerId);
  if (!layer) notFound();

  const members = entitiesInLayer(layer.id);
  const memberIds = new Set(members.map((m) => m.id));

  // Failure patterns linked from this layer's entities, even if they live in Layer 15.
  const linkedFailures = new Map<string, AtlasEntity>();
  const relatedLayerCounts = new Map<string, number>();
  for (const m of members) {
    for (const c of connectionsOf(atlas.graph, m.id)) {
      const other = atlas.graph.nodes.get(c.other);
      if (!other) continue;
      if (other.type === "failure-pattern" && !memberIds.has(other.id)) linkedFailures.set(other.id, other);
      if (other.layer !== layer.id) relatedLayerCounts.set(other.layer, (relatedLayerCounts.get(other.layer) ?? 0) + 1);
    }
  }
  const relatedLayers = [...relatedLayerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => atlas.layerById.get(id))
    .filter((l) => l !== undefined);
  const journeys = journeysTouching(memberIds);

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Domains", href: "/layers/" }, { label: layer.title }]} />
      <PageHeader
        eyebrow={
          <span className="font-mono text-xs text-muted">
            Layer {layer.number}
            {layer.priority ? ` · ${layer.priority} priority` : ""}
          </span>
        }
        title={layer.title}
        lead={layer.purpose}
      />

      <section aria-labelledby="why-h">
        <h2 id="why-h" className="mb-2 text-xl font-semibold">
          Why it matters
        </h2>
        <p className="my-2 max-w-3xl">{layer.whyItMatters}</p>
        {layer.id === "knowledge-graph" ? (
          <p className="mt-3">
            <Link href="/graph/" className="inline-block rounded-md bg-accent px-4 py-2 font-semibold text-bg no-underline">
              Open the knowledge graph explorer
            </Link>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="subs-h" className="mt-8">
        <h2 id="subs-h" className="mb-2 text-xl font-semibold">
          Subcategories
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {layer.subcategories.map((s) => (
            <div key={s.id} className="rounded-md border border-border p-4">
              <h3 className="m-0 text-base font-semibold">{s.title}</h3>
              <ul className="mt-2 mb-0 grid gap-1 pl-5 text-sm">
                {s.topics.map((t) => {
                  const e = t.entity ? atlas.graph.nodes.get(t.entity) : undefined;
                  return (
                    <li key={t.title}>
                      {e ? (
                        <Link href={entityHref(e)} className="text-accent underline-offset-4 hover:underline">
                          {t.title}
                        </Link>
                      ) : (
                        <>
                          {t.title} <span className="text-xs text-muted">(planned)</span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {GROUPS.map((g) => {
        const list = members.filter((m) => g.types.includes(m.type));
        if (list.length === 0) return null;
        return (
          <section key={g.title} aria-label={g.title} className="mt-8">
            <h2 className="m-0 text-xl font-semibold">{g.title}</h2>
            <CardGrid>
              {list.map((e) => (
                <EntityCard key={e.id} entity={e} />
              ))}
            </CardGrid>
          </section>
        );
      })}

      {linkedFailures.size > 0 ? (
        <section aria-labelledby="common-failures-h" className="mt-8">
          <h2 id="common-failures-h" className="m-0 text-xl font-semibold">
            Common failure patterns in this domain
          </h2>
          <CardGrid>
            {[...linkedFailures.values()].map((e) => (
              <EntityCard key={e.id} entity={e} />
            ))}
          </CardGrid>
        </section>
      ) : null}

      {journeys.length > 0 ? (
        <section aria-labelledby="paths-h" className="mt-8">
          <h2 id="paths-h" className="m-0 text-xl font-semibold">
            Suggested exploration paths
          </h2>
          <ul className="mt-3 grid gap-1 pl-5">
            {journeys.map((j) => (
              <li key={j.id}>
                <Link href={journeyHref(j.id)} className="text-accent underline-offset-4 hover:underline">
                  {j.title}
                </Link>
                <span className="text-muted"> — {j.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {relatedLayers.length > 0 ? (
        <section aria-labelledby="related-layers-h" className="mt-8">
          <h2 id="related-layers-h" className="m-0 text-xl font-semibold">
            Related knowledge areas
          </h2>
          <ul className="mt-3 flex list-none flex-wrap gap-2 p-0">
            {relatedLayers.map((l) => (
              <li key={l.id}>
                <Link href={layerHref(l.id)} className="inline-block rounded border border-border px-3 py-1 text-sm text-accent no-underline hover:underline">
                  {l.number}. {l.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
