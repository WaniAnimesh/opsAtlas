import * as fc from "fast-check";

import type { IncidentContentFile } from "../../types/index.js";
import { IncidentCatalog, type IncidentRepository } from "./index.js";

const incidentTextArbitrary = fc.string({ maxLength: 40 });

const incidentArbitrary: fc.Arbitrary<IncidentContentFile> = fc.record({
  slug: fc.nat().map((value) => `incident-${value}`),
  title: incidentTextArbitrary,
  org: incidentTextArbitrary,
  incident_date: fc.constant("2024-01-01"),
  summary: incidentTextArbitrary,
  impact: incidentTextArbitrary,
  failure_domain: incidentTextArbitrary,
  severity: incidentTextArbitrary,
  is_reconstruction: fc.boolean(),
  skill_tags: fc.array(incidentTextArbitrary, { maxLength: 4 }),
  sources: fc.constant([]),
  timeline: fc.constant([]),
  causal_factors: fc.constant([]),
  lessons: fc.constant([]),
});

const searchTermArbitrary = fc
  .string({ minLength: 1, maxLength: 12 })
  .map((term) => term.replace(/\s/g, "a"));

function matchingIncident(queryTerms: readonly string[]): IncidentContentFile {
  return {
    slug: "matching-incident",
    title: queryTerms.join(" "),
    org: "test-org",
    incident_date: "2024-01-01",
    summary: "Generated incident for search relevance testing",
    impact: "No production impact",
    failure_domain: "test",
    severity: "sev3",
    is_reconstruction: false,
    skill_tags: [],
    sources: [],
    timeline: [],
    causal_factors: [],
    lessons: [],
  };
}

describe("IncidentCatalog search relevance", () => {
  // Feature: opsatlas-platform, Property 6: Search Result Relevance
  it("returns only incidents containing every generated query term", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(incidentArbitrary, { maxLength: 20 }),
        fc.array(searchTermArbitrary, { minLength: 1, maxLength: 3 }),
        async (incidents, queryTerms) => {
          const repository: IncidentRepository = {
            listPublished: async () => [...incidents, matchingIncident(queryTerms)],
            getBySlug: async () => null,
          };
          const catalog = new IncidentCatalog(repository);
          const results = await catalog.search(queryTerms.join(" "));

          expect(results).toContainEqual(expect.objectContaining({ slug: "matching-incident" }));

          for (const incident of results) {
            const searchableValues = [incident.title, incident.summary, ...incident.skill_tags].map(
              (value) => value.trim().toLocaleLowerCase(),
            );

            for (const queryTerm of queryTerms) {
              const normalizedTerm = queryTerm.trim().toLocaleLowerCase();
              expect(searchableValues.some((value) => value.includes(normalizedTerm))).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
