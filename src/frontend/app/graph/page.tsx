import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Breadcrumbs, PageHeader } from "../components/atlas/primitives";
import { buildGraphPayload, getAtlas } from "../../lib/atlas/load";
import { GraphExplorer } from "./GraphExplorer";

export const metadata: Metadata = {
  title: "Knowledge Graph | OpsAtlas Decision Atlas",
  description: "Explore how architecture decisions, technologies, patterns and failure modes connect.",
  alternates: { canonical: "/graph/" },
};

const DEFAULT_FOCUS = "monolith-vs-microservices";

export default function GraphPage(): ReactNode {
  const payload = buildGraphPayload();
  const { entities, graph } = getAtlas();
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Knowledge Graph" }]} />
      <PageHeader
        title="Knowledge Graph"
        lead={`${entities.length} topics and ${graph.edges.length} typed relationships. Start from one topic, follow a connection, and come back.`}
      />
      <Suspense fallback={<p className="text-muted">Loading graph…</p>}>
        <GraphExplorer payload={payload} defaultFocus={DEFAULT_FOCUS} />
      </Suspense>
    </>
  );
}
