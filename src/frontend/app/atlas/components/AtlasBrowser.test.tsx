import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncidentSummary } from "../../../lib/content";
import { AtlasBrowser } from "./AtlasBrowser";

function inc(slug: string, title: string, org: string, domain: string): IncidentSummary {
  return {
    slug,
    title,
    org,
    incident_date: "2020-01-01",
    summary: `${title} summary`,
    failure_domain: domain,
    severity: "sev1",
    skill_tags: ["tag-" + slug],
  };
}

const incidents = [
  inc("one", "Database Failover", "GitHub", "data"),
  inc("two", "Regex Outage", "Cloudflare", "deploy"),
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AtlasBrowser", () => {
  it("lists all incidents and announces the count", () => {
    render(<AtlasBrowser incidents={incidents} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toBe("2 incidents found");
  });

  it("filters while typing, with maxLength 200", async () => {
    render(<AtlasBrowser incidents={incidents} />);
    const input = screen.getByLabelText("Search incidents") as HTMLInputElement;
    expect(input.maxLength).toBe(200);
    fireEvent.change(input, { target: { value: "REGEX" } });
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    expect(screen.getByRole("status").textContent).toBe("1 incident found");
  });

  it("filters by checkbox group", () => {
    render(<AtlasBrowser incidents={incidents} />);
    const group = screen.getByRole("group", { name: "Provider" });
    fireEvent.click(group.querySelector('input[type="checkbox"]') as HTMLInputElement);
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("shows no-results keeping state, then Clear all restores", async () => {
    render(<AtlasBrowser incidents={incidents} />);
    const input = screen.getByLabelText("Search incidents") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzzz" } });
    await screen.findByText(/No incidents match/);
    expect(input.value).toBe("zzzz");
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(input.value).toBe("");
  });

  it("uses the fetched search index when available", async () => {
    const index = [{ ...incidents[0], summary: "from index" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(index))));
    render(<AtlasBrowser incidents={incidents} />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  });
});
