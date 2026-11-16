import { render, screen, within } from "@testing-library/react";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import AtlasPage from "../app/atlas/page";
import { getIncidentBySlug, listIncidents } from "../lib/content";

function incident(slug: string, date: string, tags: string[] = ["a"]) {
  return {
    slug,
    title: `Title ${slug}`,
    org: "Acme",
    incident_date: date,
    summary: "s",
    impact: "i",
    failure_domain: "retry-storm",
    severity: "sev2",
    is_reconstruction: false,
    skill_tags: tags,
    sources: [],
    timeline: [],
    causal_factors: [],
    lessons: [],
  };
}

let dir: string;
const write = (name: string, body: unknown) =>
  writeFileSync(path.join(dir, name), typeof body === "string" ? body : JSON.stringify(body));

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-"));
  process.env["OPSATLAS_INCIDENTS_DIR"] = dir;
});
afterEach(() => {
  delete process.env["OPSATLAS_INCIDENTS_DIR"];
  rmSync(dir, { recursive: true, force: true });
});

describe("content loader", () => {
  it("sorts by date desc with slug tie-break, skipping invalid files", () => {
    write("1.json", incident("b-one", "2021-01-01"));
    write("2.json", incident("a-one", "2021-01-01"));
    write("3.json", incident("newest", "2023-05-05"));
    write("bad.json", "{not json");
    write("shape.json", { slug: "x" });
    expect(listIncidents().map((i) => i.slug)).toEqual(["newest", "a-one", "b-one"]);
  });

  it("rejects path-traversal slugs", () => {
    write("1.json", incident("ok-slug", "2021-01-01"));
    expect(getIncidentBySlug("ok-slug")?.slug).toBe("ok-slug");
    expect(getIncidentBySlug("../secret")).toBeNull();
    expect(getIncidentBySlug("missing")).toBeNull();
  });
});

describe("AtlasPage", () => {
  it("renders sorted cards with required fields, <=3 tags, and detail links", () => {
    write("1.json", incident("old-one", "2020-01-01"));
    write("2.json", incident("new-one", "2024-01-01", ["t1", "t2", "t3", "t4", "t5"]));
    render(<AtlasPage />);
    const items = within(screen.getByRole("list", { name: "Incidents" })).getAllByRole("article");
    expect(items).toHaveLength(2);
    const first = items[0]!;
    const link = within(first).getByRole("link", { name: "Title new-one" });
    expect(link).toHaveAttribute("href", expect.stringMatching(/^\/atlas\/incidents\/new-one\/?$/));
    expect(first).toHaveTextContent("Acme");
    expect(first).toHaveTextContent("retry-storm");
    expect(first).toHaveTextContent("sev2");
    expect(within(first).getAllByRole("listitem")).toHaveLength(3);
    expect(within(items[1]!).getByRole("link")).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/atlas\/incidents\/old-one\/?$/),
    );
  });

  it("shows the empty state when there are no incidents", () => {
    render(<AtlasPage />);
    expect(screen.getByText("Incident content is coming soon.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Incidents" })).toBeNull();
  });
});
