import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Breadcrumbs, PageHeader, TypeBadge } from "../../components/atlas/primitives";
import { getAtlas, getJourney } from "../../../lib/atlas/load";
import { entityHref, journeyHref } from "../../../lib/atlas/meta";

export const dynamicParams = false;

type Params = Promise<{ slug: string }>;

export function generateStaticParams(): { slug: string }[] {
  return getAtlas().journeys.map((j) => ({ slug: j.id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const j = getJourney(slug);
  if (!j) return { title: "Not found | OpsAtlas" };
  return { title: `${j.title} | Decision Journey | OpsAtlas`, description: j.summary, alternates: { canonical: journeyHref(j.id) } };
}

export default async function JourneyPage({ params }: { params: Params }): Promise<ReactNode> {
  const { slug } = await params;
  const journey = getJourney(slug);
  if (!journey) notFound();
  const { graph } = getAtlas();

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Explore", href: "/explore/" }, { label: journey.title }]} />
      <PageHeader eyebrow={<TypeBadge type="journey" />} title={journey.title} lead={journey.summary} />
      <ol className="m-0 grid list-none gap-0 p-0" data-testid="journey-steps">
        {journey.steps.map((s, i) => {
          const e = graph.nodes.get(s.entity);
          if (!e) return null;
          return (
            <li key={s.entity} className="relative border-l-2 border-accent pb-6 pl-6 last:pb-0">
              <span
                aria-hidden="true"
                className="absolute -left-[0.8rem] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-accent font-mono text-xs text-bg"
              >
                {i + 1}
              </span>
              <p className="m-0 text-sm text-muted">
                <span className="sr-only">Step {i + 1}. </span>
                {i === 0 ? "Start here" : "Why this comes next"}: {s.why}
              </p>
              <div className="mt-2 rounded-md border border-border bg-surface p-4">
                <TypeBadge type={e.type} />
                <h2 className="mt-2 mb-0 text-lg font-semibold">
                  <Link href={entityHref(e)} className="text-accent underline-offset-4 hover:underline">
                    {e.title}
                  </Link>
                </h2>
                <p className="mt-1 mb-0 text-sm text-muted">{e.question ?? e.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-8">
        <Link href={`/graph/?focus=${journey.steps[0]?.entity ?? ""}`} className="text-accent underline-offset-4 hover:underline">
          Explore these connections in the knowledge graph
        </Link>
      </p>
    </>
  );
}
