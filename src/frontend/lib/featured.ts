import fs from "node:fs";
import path from "node:path";

export interface FeaturedIncident {
  slug: string;
  title: string;
  org: string;
  failureDomain: string;
  incidentDate: string;
}

export const MAX_FEATURED = 6;

/** Content dir relative to the frontend package (src/frontend -> repo root). */
export function incidentsDir(): string {
  return path.resolve(process.cwd(), "../../content/incidents");
}

/**
 * Reads incident JSON files at build time and returns up to 6 entries,
 * most recent first. Malformed or incomplete files are skipped.
 */
export function getFeaturedIncidents(
  dir: string = incidentsDir(),
): FeaturedIncident[] {
  if (!fs.existsSync(dir)) return [];
  const items: FeaturedIncident[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as
        Record<string, unknown>;
      const { slug, title, org, failure_domain, incident_date } = raw;
      if (
        typeof slug === "string" &&
        typeof title === "string" &&
        typeof org === "string" &&
        typeof failure_domain === "string" &&
        failure_domain.length > 0 &&
        typeof incident_date === "string"
      ) {
        items.push({
          slug,
          title,
          org,
          failureDomain: failure_domain,
          incidentDate: incident_date,
        });
      }
    } catch {
      // skip unreadable file
    }
  }
  items.sort((a, b) => b.incidentDate.localeCompare(a.incidentDate));
  return items.slice(0, MAX_FEATURED);
}
