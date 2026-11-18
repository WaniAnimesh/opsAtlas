import type { MetadataRoute } from "next";
import { getAtlas } from "../lib/atlas/load";
import { entityHref, journeyHref, layerHref, TYPE_META, TYPE_ORDER } from "../lib/atlas/meta";
import { listIncidents } from "../lib/content";

export const dynamic = "force-static";

/** Stable URLs for every Atlas entity, layer, journey and incident (PRD 14.4). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000").replace(/\/$/, "");
  const atlas = getAtlas();
  const paths = [
    "/",
    "/explore/",
    "/layers/",
    "/graph/",
    "/search/",
    "/atlas/",
    ...TYPE_ORDER.map((t) => `/${TYPE_META[t].section}/`),
    ...atlas.layers.map((l) => layerHref(l.id)),
    ...atlas.journeys.map((j) => journeyHref(j.id)),
    ...listIncidents().map((i) => `/atlas/incidents/${i.slug}/`),
  ];
  const entityEntries = atlas.entities.map((e) => ({ url: `${base}${entityHref(e)}`, lastModified: e.lastReviewed }));
  return [...paths.map((p) => ({ url: `${base}${p}` })), ...entityEntries];
}
