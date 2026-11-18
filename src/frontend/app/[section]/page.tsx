import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Breadcrumbs, CardGrid, EntityCard, PageHeader, TypeBadge } from "../components/atlas/primitives";
import { entitiesOfType, getAtlas } from "../../lib/atlas/load";
import { layerHref, sectionToType, TYPE_META, TYPE_ORDER } from "../../lib/atlas/meta";
import type { AtlasEntity } from "../../lib/atlas/types";

export const dynamicParams = false;

type Params = Promise<{ section: string }>;

export function generateStaticParams(): { section: string }[] {
  return TYPE_ORDER.map((t) => ({ section: TYPE_META[t].section }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { section } = await params;
  const type = sectionToType(section);
  if (!type) return { title: "Not found | OpsAtlas" };
  return {
    title: `${TYPE_META[type].plural} | OpsAtlas Decision Atlas`,
    description: TYPE_META[type].blurb,
    alternates: { canonical: `/${section}/` },
  };
}

export default async function SectionIndex({ params }: { params: Params }): Promise<ReactNode> {
  const { section } = await params;
  const type = sectionToType(section);
  if (!type) notFound();
  const meta = TYPE_META[type];
  const atlas = getAtlas();
  const entities = entitiesOfType(type);

  // Group by primary layer, in taxonomy order.
  const groups = new Map<string, AtlasEntity[]>();
  for (const e of entities) {
    const list = groups.get(e.layer) ?? [];
    list.push(e);
    groups.set(e.layer, list);
  }
  const ordered = atlas.layers.filter((l) => groups.has(l.id));

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: meta.plural }]} />
      <PageHeader eyebrow={<TypeBadge type={type} />} title={meta.plural} lead={meta.blurb}>
        <p className="mt-2 mb-0 text-sm text-muted">{entities.length} pages</p>
      </PageHeader>
      {ordered.map((l) => (
        <section key={l.id} aria-labelledby={`g-${l.id}`} className="mt-8">
          <h2 id={`g-${l.id}`} className="m-0 text-xl font-semibold">
            <Link href={layerHref(l.id)} className="text-fg underline-offset-4 hover:underline">
              {l.number}. {l.title}
            </Link>
          </h2>
          <CardGrid>
            {(groups.get(l.id) ?? []).map((e) => (
              <EntityCard key={e.id} entity={e} />
            ))}
          </CardGrid>
        </section>
      ))}
    </>
  );
}
