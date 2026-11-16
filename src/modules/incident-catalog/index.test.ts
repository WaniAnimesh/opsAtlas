import * as fc from "fast-check";

import { IncidentCatalog, type IncidentFilters, type IncidentRepository } from "./index.js";
import type { IncidentContentFile } from "../../types/index.js";

const TOKENS = [
  "aws",
  "database",
  "network",
  "retry",
  "latency",
  "kafka",
  "cloud",
  "capacity",
  "service",
  "storage",
  "deployment",
  "observability",
] as const;

const tokenArbitrary = fc.constantFrom(...TOKENS);
const filterValueArbitrary = fc
  .array(tokenArbitrary, { minLength: 1, maxLength: 3 })
  .map((values) => (values.length === 1 ? values[0] : values));
const technologyArbitrary = fc.oneof(
  tokenArbitrary,
  fc.array(tokenArbitrary, { minLength: 1, maxLength: 3 }),
);

const incidentArbitrary: fc.Arbitrary<IncidentContentFile> = fc
  .record({
    title: fc.array(tokenArbitrary, { minLength: 1, maxLength: 4 }).map((words) => words.join(" ")),
    org: tokenArbitrary,
    incident_date: fc.constant("2024-01-01"),
    summary: fc
      .array(tokenArbitrary, { minLength: 1, maxLength: 5 })
      .map((words) => words.join(" ")),
    failure_domain: tokenArbitrary,
    severity: fc.constantFrom("sev1", "sev2", "sev3"),
    skill_tags: fc.array(tokenArbitrary, { minLength: 1, maxLength: 4 }),
    technology: fc.option(technologyArbitrary, { nil: null }),
  })
  .map(({ technology, ...incident }) => ({
    ...incident,
    slug: "generated",
    impact: "Generated test impact",
    is_reconstruction: false,
    sources: [{ publisher: "Generated test source", source_tier: "tier1" as const }],
    timeline: [],
    causal_factors: [],
    lessons: [],
    ...(technology === null ? {} : { technology }),
  }));

const providerOrOrgFilterArbitrary: fc.Arbitrary<IncidentFilters> = fc.oneof(
  fc.constant({} as IncidentFilters),
  filterValueArbitrary.map((provider) => ({ provider }) as IncidentFilters),
  filterValueArbitrary.map((org) => ({ org }) as IncidentFilters),
);

const filtersArbitrary: fc.Arbitrary<IncidentFilters> = fc
  .record({
    providerOrOrg: providerOrOrgFilterArbitrary,
    technology: fc.option(filterValueArbitrary, { nil: null }),
    failure_domain: fc.option(filterValueArbitrary, { nil: null }),
    severity: fc.option(filterValueArbitrary, { nil: null }),
  })
  .map(({ providerOrOrg, technology, failure_domain, severity }) => ({
    ...providerOrOrg,
    ...(technology === null ? {} : { technology }),
    ...(failure_domain === null ? {} : { failure_domain }),
    ...(severity === null ? {} : { severity }),
  }));

const queryArbitrary = fc
  .array(tokenArbitrary, { minLength: 0, maxLength: 3 })
  .map((terms) =>
    terms.map((term, index) => (index % 2 === 0 ? term : term.toUpperCase())).join(" "),
  );

type FilterValue = string | readonly string[];

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function filterValues(value: FilterValue | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return (Array.isArray(value) ? value : [value]).map(normalize).filter(Boolean);
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

function technologyValues(incident: IncidentContentFile): string[] {
  if (incident.technology === undefined) {
    return [];
  }

  return Array.isArray(incident.technology) ? incident.technology : [incident.technology];
}

function matchesFilters(incident: IncidentContentFile, filters: IncidentFilters): boolean {
  const providerFilter = filters.provider ?? filters.org;
  return (
    matchesFilter([incident.org], providerFilter) &&
    matchesFilter([...technologyValues(incident), ...incident.skill_tags], filters.technology) &&
    matchesFilter([incident.failure_domain], filters.failure_domain) &&
    matchesFilter([incident.severity], filters.severity)
  );
}

function matchesSearch(incident: IncidentContentFile, query: string): boolean {
  const terms = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  const values = [
    incident.title,
    incident.summary,
    ...incident.skill_tags,
    ...technologyValues(incident),
  ].map(normalize);

  return terms.every((term) => values.some((value) => value.includes(term)));
}

// Feature: opsatlas-platform, Property 7: Multi-Filter Intersection
describe("IncidentCatalog Property 7", () => {
  it("returns only incidents satisfying every active filter and search term", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(incidentArbitrary, { maxLength: 20 }),
        filtersArbitrary,
        queryArbitrary,
        async (generatedIncidents, filters, query) => {
          const incidents = generatedIncidents.map((incident, index) => ({
            ...incident,
            slug: `incident-${index}`,
          }));
          const repository: IncidentRepository = {
            listPublished: async () => incidents,
            getBySlug: async (slug) => incidents.find((incident) => incident.slug === slug) ?? null,
          };
          const catalog = new IncidentCatalog(repository);

          const results = await catalog.search(query, filters);

          for (const result of results) {
            const incident = incidents.find((candidate) => candidate.slug === result.slug);
            expect(incident).toBeDefined();
            expect(matchesFilters(incident as IncidentContentFile, filters)).toBe(true);
            expect(matchesSearch(incident as IncidentContentFile, query)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
