import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { IncidentRecord } from "../../../../lib/content";
import { IncidentDetail, NO_CONTENT, RECONSTRUCTION_BANNER } from "./IncidentDetail";

function make(over: Partial<IncidentRecord> & Record<string, unknown> = {}): IncidentRecord {
  return {
    slug: "x",
    title: "Title X",
    org: "Org",
    incident_date: "2020-01-01",
    summary: "Sum",
    impact: "Imp",
    failure_domain: "dom",
    severity: "sev1",
    is_reconstruction: true,
    skill_tags: [],
    sources: [
      { publisher: "Pub", url: "https://example.com/a", published_at: "2020-02-01", source_tier: "tier1" },
      { publisher: "Book", url: "javascript:alert(1)", source_tier: "tier3" },
      { publisher: "Print only", url: "", source_tier: "tier2" },
    ],
    timeline: [
      { occurred_at: "2020-01-01T10:05:00+00:00", tz_offset: "+00:00", description: "second", confidence: "inference", source_ref: "Pub", sequence_pos: 1 },
      { occurred_at: "2020-01-01T10:05:00+00:00", tz_offset: "+00:00", description: "first-tie", confidence: "fact", source_ref: "Pub", sequence_pos: 0 },
      { occurred_at: "2020-01-01", tz_offset: "+02:00", description: "earliest", confidence: "teaching simplification", source_ref: "Book", sequence_pos: 0 },
    ],
    causal_factors: [{ factor_type: "ft", description: "cf", confidence: "weird" }],
    lessons: [{ statement: "lesson one" }],
    ...over,
  } as IncidentRecord;
}

describe("IncidentDetail", () => {
  it("shows banner only for reconstructions", () => {
    const { unmount } = render(<IncidentDetail incident={make()} scenario={null} />);
    expect(screen.getByText(RECONSTRUCTION_BANNER)).toBeTruthy();
    unmount();
    render(<IncidentDetail incident={make({ is_reconstruction: false })} scenario={null} />);
    expect(screen.queryByText(RECONSTRUCTION_BANNER)).toBeNull();
  });

  it("always renders sections with empty indicators", () => {
    render(
      <IncidentDetail
        incident={make({ summary: "", impact: "", timeline: [], causal_factors: [], lessons: [], sources: [] })}
        scenario={null}
      />,
    );
    for (const name of [
      "Summary", "Architecture context", "Customer impact", "Causal factors",
      "Recovery steps", "Lessons learned", "Timeline", "Sources",
    ]) {
      const h = screen.getByRole("heading", { name });
      expect(within(h.closest("section") as HTMLElement).getByText(NO_CONTENT)).toBeTruthy();
    }
  });

  it("renders architecture/recovery when fields exist", () => {
    render(
      <IncidentDetail
        incident={make({ architecture_context: "Arch text", recovery_steps: ["step A", "step B"] })}
        scenario={null}
      />,
    );
    expect(screen.getByText("Arch text")).toBeTruthy();
    expect(screen.getByText("step B")).toBeTruthy();
  });

  it("orders timeline ascending with ISO timestamps incl. offset", () => {
    const { container } = render(<IncidentDetail incident={make()} scenario={null} />);
    const times = Array.from(container.querySelectorAll("#timeline ~ ol time, section[aria-labelledby=timeline] time"));
    const iso = times.map((t) => t.getAttribute("dateTime"));
    expect(iso).toEqual(["2020-01-01T00:00:00+02:00", "2020-01-01T10:05:00+00:00", "2020-01-01T10:05:00+00:00"]);
    for (const v of iso) expect(v).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/);
    const items = Array.from(container.querySelectorAll("section[aria-labelledby=timeline] li p:first-of-type")).map((p) => p.textContent);
    expect(items).toEqual(["earliest", "first-tie", "second"]);
  });

  it("links sources with URL, bibliographic text otherwise, never unsafe", () => {
    render(<IncidentDetail incident={make()} scenario={null} />);
    const src = screen.getByRole("heading", { name: "Sources" }).closest("section") as HTMLElement;
    const link = within(src).getByRole("link", { name: "Pub" });
    expect(link.getAttribute("href")).toBe("https://example.com/a");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(src).getByText(/tier1/)).toBeTruthy();
    expect(within(src).getByText(/Print only/)).toBeTruthy();
    expect(within(src).queryByRole("link", { name: /Book/ })).toBeNull();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it("shows confidence text with non-colour indicator and accessible name", () => {
    render(<IncidentDetail incident={make()} scenario={null} />);
    for (const c of ["fact", "inference", "teaching simplification", "unknown"]) {
      const el = screen.getAllByRole("img", { name: `Confidence: ${c}` })[0] as HTMLElement;
      expect(el.textContent).toContain(c);
      expect(el.className).toMatch(/border-(solid|dashed|dotted|double)/);
      expect(el.querySelector('[aria-hidden="true"]')?.textContent).toBeTruthy();
    }
  });

  it("links to the linked scenario brief", () => {
    render(<IncidentDetail incident={make()} scenario={{ id: "sc-1", title: "Scen" }} />);
    const a = screen.getByRole("link", { name: /Practice this incident.*Scen/ });
    expect(a.getAttribute("href")).toMatch(/^\/simulator\/sc-1\/brief\/?$/);
    expect(a.getAttribute("target")).toBeNull();
  });
});
