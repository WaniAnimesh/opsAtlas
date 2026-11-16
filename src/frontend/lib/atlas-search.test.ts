import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  buildFilterOptions,
  filterIncidents,
  parseTerms,
  type AtlasEntry,
} from "./atlas-search";

const a: AtlasEntry = {
  slug: "a",
  title: "Database Failover",
  summary: "Primary lost quorum",
  skill_tags: ["postgres", "triage"],
  failure_domain: "data",
  severity: "sev1",
  org: "GitHub",
};
const b: AtlasEntry = {
  slug: "b",
  title: "Regex outage",
  summary: "CPU exhaustion",
  skill_tags: ["regex"],
  failure_domain: "deploy",
  severity: "sev2",
  org: "Cloudflare",
  technology: "WAF",
};
const all = [a, b];

describe("filterIncidents", () => {
  it("returns everything with no query or filters", () => {
    expect(filterIncidents(all, "  ", EMPTY_FILTERS)).toEqual(all);
  });
  it("matches case-insensitive substrings with AND across terms", () => {
    expect(filterIncidents(all, "DATABASE quorum", EMPTY_FILTERS)).toEqual([a]);
    expect(filterIncidents(all, "database cpu", EMPTY_FILTERS)).toEqual([]);
  });
  it("searches technology and tags", () => {
    expect(filterIncidents(all, "waf", EMPTY_FILTERS)).toEqual([b]);
    expect(filterIncidents(all, "postg", EMPTY_FILTERS)).toEqual([a]);
  });
  it("ORs within a dimension and ANDs across dimensions", () => {
    const f = { ...EMPTY_FILTERS, provider: ["GitHub", "Cloudflare"] };
    expect(filterIncidents(all, "", f)).toEqual(all);
    expect(filterIncidents(all, "", { ...f, failure_domain: ["deploy"] })).toEqual([b]);
  });
  it("technology filter matches technology or skill_tags", () => {
    expect(filterIncidents(all, "", { ...EMPTY_FILTERS, technology: ["waf"] })).toEqual([b]);
    expect(filterIncidents(all, "", { ...EMPTY_FILTERS, technology: ["triage"] })).toEqual([a]);
  });
  it("builds options", () => {
    expect(buildFilterOptions(all).provider).toEqual(["Cloudflare", "GitHub"]);
  });
});

describe("Property 7: results satisfy every active filter and term", () => {
  const word = fc.constantFrom("alpha", "beta", "gamma", "delta", "Redis", "kafka");
  const entry = fc.record({
    slug: fc.uuid(),
    title: fc.array(word, { maxLength: 3 }).map((w) => w.join(" ")),
    summary: fc.array(word, { maxLength: 4 }).map((w) => w.join(" ")),
    skill_tags: fc.array(word, { maxLength: 3 }),
    failure_domain: fc.constantFrom("x", "y", "z"),
    severity: fc.constant("sev1"),
    org: fc.constantFrom("o1", "o2", "o3"),
  });

  /**
   * **Validates: Requirements 2.2, 2.3, 2.4, 2.5**
   */
  it("holds for arbitrary data, queries and filters", () => {
    fc.assert(
      fc.property(
        fc.array(entry, { maxLength: 12 }),
        fc.array(word, { maxLength: 3 }).map((w) => w.join(" ").toUpperCase()),
        fc.subarray(["o1", "o2", "o3"]),
        fc.subarray(["x", "y", "z"]),
        (entries, query, provider, failure_domain) => {
          const filters = { provider, technology: [], failure_domain };
          const out = filterIncidents(entries, query, filters);
          const terms = parseTerms(query);
          for (const e of out) {
            if (provider.length) expect(provider).toContain(e.org);
            if (failure_domain.length) expect(failure_domain).toContain(e.failure_domain);
            const hay = [e.title, e.summary, ...e.skill_tags].map((s) => s.toLowerCase());
            for (const t of terms) expect(hay.some((h) => h.includes(t))).toBe(true);
          }
          // completeness: nothing satisfying everything is dropped
          const expected = entries.filter(
            (e) =>
              (!provider.length || provider.includes(e.org)) &&
              (!failure_domain.length || failure_domain.includes(e.failure_domain)) &&
              terms.every((t) =>
                [e.title, e.summary, ...e.skill_tags].some((s) => s.toLowerCase().includes(t)),
              ),
          );
          expect(out).toEqual(expected);
        },
      ),
    );
  });
});
