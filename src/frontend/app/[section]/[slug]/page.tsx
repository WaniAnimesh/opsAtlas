import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { EntityView, type IncidentLink } from "../../components/atlas/EntityView";
import { relatedGroups, type Connection } from "../../../lib/atlas/graph";
import { getAtlas, getEntity, journeysTouching } from "../../../lib/atlas/load";
import { entityHref, sectionToType, TYPE_META } from "../../../lib/atlas/meta";
import type { AtlasEntity, Layer } from "../../../lib/atlas/types";
import { getIncidentBySlug } from "../../../lib/content";

export const dynamicParams = false;

type Params = Promise<{ section: string; slug: string }>;

export function generateStaticParams(): { section: string; slug: string }[] {
  return getAtlas().entities.map((e) => ({ section: TYPE_META[e.type].section, slug: e.id }));
}

function resolve(section: string, slug: string): AtlasEntity | null {
  const type = sectionToType(section);
  const entity = getEntity(slug);
  return type && entity && entity.type === type ? entity : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { section, slug } = await params;
  const e = resolve(section, slug);
  if (!e) return { title: "Not found | OpsAtlas" };
  return {
    title: `${e.title} | ${TYPE_META[e.type].label} | OpsAtlas Decision Atlas`,
    description: e.description,
    alternates: { canonical: entityHref(e) },
    keywords: e.tags,
  };
}

export default async function EntityPage({ params }: { params: Params }): Promise<ReactNode> {
  const { section, slug } = await params;
  const entity = resolve(section, slug);
  if (!entity) notFound();
  const atlas = getAtlas();
  const layer = atlas.layerById.get(entity.layer);
  if (!layer) notFound();

  const related = relatedGroups(atlas.graph, entity.id);
  const ids = new Set<string>([
    ...(Object.values(related) as Connection[][]).flatMap((conns) => conns.map((c) => c.other)),
    ...(entity.criteria ?? []).flatMap((c) => c.explore ?? []),
  ]);
  const journeys = journeysTouching(new Set([entity.id]));
  for (const j of journeys) for (const s of j.steps) ids.add(s.entity);

  const lookup: Record<string, Pick<AtlasEntity, "id" | "type" | "title" | "description" | "question">> = {};
  for (const id of ids) {
    const e = atlas.graph.nodes.get(id);
    if (e) {
      lookup[id] = { id: e.id, type: e.type, title: e.title, description: e.description, ...(e.question ? { question: e.question } : {}) };
    }
  }

  const incidents: IncidentLink[] = (entity.incidents ?? [])
    .map((s) => getIncidentBySlug(s))
    .filter((i): i is NonNullable<typeof i> => i !== null)
    .map((i) => ({ slug: i.slug, title: i.title }));

  const secondaryLayers = (entity.secondaryLayers ?? [])
    .map((l) => atlas.layerById.get(l))
    .filter((l): l is Layer => l !== undefined);

  return (
    <EntityView
      entity={entity}
      layer={layer}
      secondaryLayers={secondaryLayers}
      related={related}
      lookup={lookup}
      journeys={journeys}
      incidents={incidents}
    />
  );
}
