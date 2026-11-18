import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { JourneyList } from "../components/atlas/JourneyList";
import { LayerGrid } from "../components/atlas/LayerGrid";
import { Breadcrumbs, PageHeader, TypeBadge } from "../components/atlas/primitives";
import { QuestionList } from "../components/atlas/QuestionList";
import { entitiesInLayer, entitiesOfType, getAtlas } from "../../lib/atlas/load";
import { TYPE_META, TYPE_ORDER } from "../../lib/atlas/meta";

export const metadata: Metadata = {
  title: "Explore | OpsAtlas Decision Atlas",
  description: "Start from an engineering problem and follow the decisions, tradeoffs and failure patterns it leads to.",
  alternates: { canonical: "/explore/" },
};

export default function ExplorePage(): ReactNode {
  const atlas = getAtlas();
  const counts = Object.fromEntries(atlas.layers.map((l) => [l.id, entitiesInLayer(l.id).length]));
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Explore" }]} />
      <PageHeader
        title="Explore"
        lead="Start from the problem you have. Each journey explains why one decision leads to the next."
      />

      <section aria-labelledby="journeys-h">
        <h2 id="journeys-h" className="m-0 text-xl font-semibold">
          Start from a problem
        </h2>
        <JourneyList journeys={atlas.journeys} />
      </section>

      <section aria-labelledby="questions-h" className="mt-10">
        <h2 id="questions-h" className="m-0 text-xl font-semibold">
          Common questions
        </h2>
        <QuestionList atlas={atlas} />
      </section>

      <section aria-labelledby="types-h" className="mt-10">
        <h2 id="types-h" className="m-0 text-xl font-semibold">
          Browse by content type
        </h2>
        <ul className="mt-3 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {TYPE_ORDER.map((t) => (
            <li key={t} className="rounded-md border border-border bg-surface p-4">
              <TypeBadge type={t} />
              <h3 className="mt-2 mb-0 text-base font-semibold">
                <Link href={`/${TYPE_META[t].section}/`} className="text-accent underline-offset-4 hover:underline">
                  {TYPE_META[t].plural}
                </Link>{" "}
                <span className="text-sm font-normal text-muted">({entitiesOfType(t).length})</span>
              </h3>
              <p className="mt-1 mb-0 text-sm text-muted">{TYPE_META[t].blurb}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="layers-h" className="mt-10">
        <h2 id="layers-h" className="m-0 text-xl font-semibold">
          Browse by domain
        </h2>
        <LayerGrid layers={atlas.layers} counts={counts} />
      </section>
    </>
  );
}
