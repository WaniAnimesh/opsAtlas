import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getIncidentBySlug, listIncidents } from "../../../../lib/content";
import { findScenarioForIncident } from "../../../../lib/linked-scenario";
import { IncidentDetail } from "./IncidentDetail";

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return listIncidents().map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const incident = getIncidentBySlug(slug);
  return { title: incident ? `${incident.title} | OpsAtlas` : "Incident not found | OpsAtlas" };
}

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ReactNode> {
  const { slug } = await params;
  const incident = getIncidentBySlug(slug);
  if (!incident) notFound();
  return <IncidentDetail incident={incident} scenario={findScenarioForIncident(incident.slug)} />;
}
