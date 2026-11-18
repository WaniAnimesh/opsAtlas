import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Breadcrumbs, PageHeader } from "../components/atlas/primitives";
import { buildSearchDocs } from "../../lib/atlas/load";
import { SearchView } from "./SearchView";

export const metadata: Metadata = {
  title: "Search | OpsAtlas Decision Atlas",
  description: "Search architecture decisions, technologies, comparisons, failure patterns and frameworks.",
  alternates: { canonical: "/search/" },
};

const SUGGESTIONS = [
  "How do I reduce database load?",
  "How should I scale a monolith?",
  "How do I avoid cascading failures?",
  "How do I handle asynchronous communication?",
  "How do I reduce cloud costs?",
  "Kubernetes",
  "OpenTelemetry",
];

export default function SearchPage(): ReactNode {
  const docs = buildSearchDocs();
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Search" }]} />
      <PageHeader title="Search the Atlas" lead="Search by name when you know the term, or describe the problem when you do not." />
      <Suspense fallback={<p className="text-muted">Loading search…</p>}>
        <SearchView docs={docs} suggestions={SUGGESTIONS} />
      </Suspense>
    </>
  );
}
