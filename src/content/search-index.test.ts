import { describe, expect, it } from "vitest";
import { buildSearchIndex, serializeSearchIndex } from "./search-index";

const base = {
  title: "t",
  summary: "s",
  skill_tags: ["a"],
  failure_domain: "fd",
  severity: "sev1",
  org: "o",
};

describe("search index", () => {
  const input = [
    { ...base, slug: "b", incident_date: "2020-01-01" },
    { ...base, slug: "a", incident_date: "2020-01-01" },
    { ...base, slug: "z", incident_date: "2022-05-05", technology: "k8s" },
  ];

  it("sorts by date desc then slug and keeps only index fields", () => {
    const out = buildSearchIndex(input);
    expect(out.map((e) => e.slug)).toEqual(["z", "a", "b"]);
    expect(Object.keys(out[1] ?? {})).toEqual([
      "slug",
      "title",
      "summary",
      "skill_tags",
      "failure_domain",
      "severity",
      "org",
    ]);
    expect(out[0]?.technology).toBe("k8s");
    expect(out[1]).not.toHaveProperty("technology");
    expect(out[1]).not.toHaveProperty("incident_date");
  });

  it("is deterministic regardless of input order", () => {
    const a = serializeSearchIndex(buildSearchIndex(input));
    const b = serializeSearchIndex(buildSearchIndex([...input].reverse()));
    expect(a).toBe(b);
    expect(a.endsWith("}\n]\n")).toBe(true);
  });
});
