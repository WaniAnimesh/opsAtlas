import type { ContentBundle } from "../../content/bundle.js";
import type { IncidentContentFile } from "../../types/index.js";
import { INCIDENT_SLUG_PATTERN } from "./guards.js";

export { INCIDENT_SLUG_PATTERN, isIncidentContentFile } from "./guards.js";

type FilterValue = string | readonly string[];

/**
 * Filters supported by the file-backed incident catalog.
 * `provider` is the public filter name; `org` is accepted as its content-field
 * equivalent. Values within one dimension are treated as an OR selection.
 */
export interface IncidentFilters {
  provider?: FilterValue;
  org?: FilterValue;
  technology?: FilterValue;
  failure_domain?: FilterValue;
  severity?: FilterValue;
}

/** The fields needed to render and search an incident catalog entry. */
export interface IncidentSummary {
  slug: string;
  title: string;
  org: string;
  incident_date: string;
  summary: string;
  failure_domain: string;
  severity: string;
  skill_tags: string[];
}

export type IncidentDetail = IncidentContentFile;

/** Storage boundary for the file-backed incident catalog. */
export interface IncidentRepository {
  listPublished(): Promise<IncidentDetail[]>;
  getBySlug(slug: string): Promise<IncidentDetail | null>;
}

export interface IncidentCatalogService {
  listPublished(filters?: IncidentFilters): Promise<IncidentSummary[]>;
  search(query: string, filters?: IncidentFilters): Promise<IncidentSummary[]>;
  getBySlug(slug: string): Promise<IncidentDetail | null>;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function filterValues(value: FilterValue | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  return values.map(normalize).filter((item) => item.length > 0);
}

function matchesFilter(
  candidateValues: readonly string[],
  filter: FilterValue | undefined,
): boolean {
  const values = filterValues(filter);
  return (
    values.length === 0 ||
    values.some((value) => candidateValues.some((candidate) => normalize(candidate) === value))
  );
}

function optionalTechnologyValues(incident: IncidentContentFile): string[] {
  if (incident.technology === undefined) {
    return [];
  }

  return Array.isArray(incident.technology) ? incident.technology : [incident.technology];
}

function matchesFilters(incident: IncidentContentFile, filters: IncidentFilters): boolean {
  const providerFilter = filters.provider ?? filters.org;
  const technologyValues = [...optionalTechnologyValues(incident), ...incident.skill_tags];

  return (
    matchesFilter([incident.org], providerFilter) &&
    matchesFilter(technologyValues, filters.technology) &&
    matchesFilter([incident.failure_domain], filters.failure_domain) &&
    matchesFilter([incident.severity], filters.severity)
  );
}

function sortIncidents(incidents: IncidentContentFile[]): IncidentContentFile[] {
  return [...incidents].sort((left, right) => {
    const dateOrder = right.incident_date.localeCompare(left.incident_date);
    return dateOrder === 0 ? left.slug.localeCompare(right.slug) : dateOrder;
  });
}

function searchValues(incident: IncidentContentFile): string[] {
  return [
    incident.title,
    incident.summary,
    ...incident.skill_tags,
    ...optionalTechnologyValues(incident),
  ].map(normalize);
}

function matchesSearch(incident: IncidentContentFile, terms: readonly string[]): boolean {
  const values = searchValues(incident);
  return terms.every((term) => values.some((value) => value.includes(term)));
}

function toSummary(incident: IncidentContentFile): IncidentSummary {
  return {
    slug: incident.slug,
    title: incident.title,
    org: incident.org,
    incident_date: incident.incident_date,
    summary: incident.summary,
    failure_domain: incident.failure_domain,
    severity: incident.severity,
    skill_tags: [...incident.skill_tags],
  };
}

/** Public service that maps repository content to catalog summaries. */
export class IncidentCatalog implements IncidentCatalogService {
  public constructor(private readonly repository: IncidentRepository) {}

  public async listPublished(filters: IncidentFilters = {}): Promise<IncidentSummary[]> {
    const incidents = await this.repository.listPublished();

    return sortIncidents(incidents.filter((incident) => matchesFilters(incident, filters))).map(
      toSummary,
    );
  }

  public async search(query: string, filters: IncidentFilters = {}): Promise<IncidentSummary[]> {
    const incidents = await this.repository.listPublished();
    // An empty or whitespace-only query intentionally behaves like listPublished(filters),
    // so clearing search never throws and restores the filtered published list.
    const terms = query
      .trim()
      .split(/\s+/)
      .map(normalize)
      .filter((term) => term.length > 0);

    return sortIncidents(
      incidents
        .filter((incident) => matchesFilters(incident, filters))
        .filter((incident) => terms.length === 0 || matchesSearch(incident, terms)),
    ).map(toSummary);
  }

  public async getBySlug(slug: string): Promise<IncidentDetail | null> {
    if (!INCIDENT_SLUG_PATTERN.test(slug)) {
      return null;
    }

    return this.repository.getBySlug(slug);
  }
}

/** Incident repository over an in-memory list (build-time bundle in the Worker). */
export class InMemoryIncidentRepository implements IncidentRepository {
  private readonly incidents: IncidentContentFile[];

  public constructor(incidents: readonly IncidentContentFile[]) {
    this.incidents = incidents.map((incident) => structuredClone(incident));
  }

  public async listPublished(): Promise<IncidentDetail[]> {
    return this.incidents.map((incident) => structuredClone(incident));
  }

  public async getBySlug(slug: string): Promise<IncidentDetail | null> {
    const match = this.incidents.find((incident) => incident.slug === slug);
    return match === undefined ? null : structuredClone(match);
  }
}

/** Incident repository over the build-time content bundle (Worker). */
export class BundledIncidentRepository extends InMemoryIncidentRepository {
  public constructor(bundle: Pick<ContentBundle, "incidents">) {
    super(bundle.incidents);
  }
}
