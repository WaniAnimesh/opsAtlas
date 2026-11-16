import type { Metadata } from "next";
import type { ReactNode } from "react";
import { listIncidents, toIncidentSummary } from "../../lib/content";
import { AtlasBrowser } from "./components/AtlasBrowser";

export const metadata: Metadata = {
  title: "Atlas | OpsAtlas",
  description: "Browse real-world incidents and the lessons they teach.",
};

export default function AtlasPage(): ReactNode {
  // Runs at build time (static export); content is read from disk.
  const incidents = listIncidents().map(toIncidentSummary);
  return (
    <>
      <h1 className="mt-0 text-3xl font-semibold">Incident Atlas</h1>
      <AtlasBrowser incidents={incidents} />
    </>
  );
}
