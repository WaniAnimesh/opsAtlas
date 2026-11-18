import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LayerGrid } from "../components/atlas/LayerGrid";
import { Breadcrumbs, PageHeader } from "../components/atlas/primitives";
import { entitiesInLayer, getAtlas } from "../../lib/atlas/load";

export const metadata: Metadata = {
  title: "Domains: the 19 layers | OpsAtlas Decision Atlas",
  description: "Browse the Decision Atlas by domain, from foundations and architecture decisions to failure patterns and the knowledge graph.",
  alternates: { canonical: "/layers/" },
};

export default function LayersIndex(): ReactNode {
  const { layers } = getAtlas();
  const counts = Object.fromEntries(layers.map((l) => [l.id, entitiesInLayer(l.id).length]));
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Domains" }]} />
      <PageHeader
        title="Domains"
        lead="Nineteen layers organize the Atlas. Each one links to the decisions, technologies and failure patterns that belong to it."
      />
      <LayerGrid layers={layers} counts={counts} />
    </>
  );
}
