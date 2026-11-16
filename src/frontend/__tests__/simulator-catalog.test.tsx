import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScenarioCatalog } from "../app/simulator/components/ScenarioCatalog";

const base = {
  incident_slug: "inc",
  est_duration_min: 30,
  skill_tags: ["triage", "rollback"],
  version: "1.0.0",
};

const payload = [
  { ...base, id: "s1", title: "Alpha", objective: "Fix alpha.", difficulty: "beginner" },
  { ...base, id: "s2", title: "Beta", objective: "x".repeat(300), difficulty: "intermediate" },
  { ...base, id: "s3", title: "Gamma", objective: "Fix gamma.", difficulty: "advanced" },
  { bogus: true },
  { ...base, id: "bad id", title: "Bad", objective: "o", difficulty: "beginner" },
];

function mockFetch(impl: () => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

const ok = (body: unknown): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe("ScenarioCatalog", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("shows an accessible loading status first", () => {
    mockFetch(() => new Promise<Response>(() => {}));
    render(<ScenarioCatalog />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("renders cards with all fields, ignoring malformed entries", async () => {
    mockFetch(() => ok(payload));
    render(<ScenarioCatalog />);
    const items = await screen.findAllByRole("link");
    expect(items).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getAllByText("30 min")).toHaveLength(3);
    expect(screen.getAllByText("triage")).toHaveLength(3);
    expect(screen.getByText("Fix alpha.")).toBeInTheDocument();
    // objective truncated to <= 160 chars
    const long = screen.getByText(/^x+\u2026$/);
    expect(long.textContent!.length).toBeLessThanOrEqual(160);
  });

  it("labels difficulty in text", async () => {
    mockFetch(() => ok(payload));
    render(<ScenarioCatalog />);
    await screen.findAllByRole("link");
    expect(screen.getByText("Difficulty: Beginner")).toBeInTheDocument();
    expect(screen.getByText("Difficulty: Intermediate")).toBeInTheDocument();
    expect(screen.getByText("Difficulty: Advanced")).toBeInTheDocument();
  });

  it("links each card to its brief page", async () => {
    mockFetch(() => ok(payload));
    render(<ScenarioCatalog />);
    const links = await screen.findAllByRole("link");
    // next/link normalises the trailing slash according to next.config (absent in tests).
    expect(links.map((l) => l.getAttribute("href")?.replace(/\/$/, ""))).toEqual([
      "/simulator/s1/brief",
      "/simulator/s2/brief",
      "/simulator/s3/brief",
    ]);
  });

  it("shows the empty state", async () => {
    mockFetch(() => ok([]));
    render(<ScenarioCatalog />);
    expect(await screen.findByText(/Scenarios are coming soon/)).toBeInTheDocument();
  });

  it("shows an error alert and retries", async () => {
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return calls === 1
        ? Promise.resolve(new Response("nope", { status: 500 }))
        : ok(payload);
    });
    render(<ScenarioCatalog />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getAllByRole("link")).toHaveLength(3));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
