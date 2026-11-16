import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_PROGRESS_KEY, readProgress } from "../../../../lib/local-progress";
import { BriefClient } from "./BriefClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const brief = {
  id: "fx",
  title: "Database Failover",
  objective: "Restore service.",
  difficulty: "Intermediate",
  est_duration_min: 45,
  skill_tags: ["postgres", "triage"],
  version: "1",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  push.mockReset();
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BriefClient", () => {
  it("renders brief fields", async () => {
    fetchMock.mockResolvedValueOnce(json(200, brief));
    render(<BriefClient scenarioId="fx" />);
    expect(await screen.findByRole("heading", { name: "Database Failover" })).toBeTruthy();
    expect(screen.getByText("Restore service.")).toBeTruthy();
    expect(screen.getByText("Intermediate")).toBeTruthy();
    expect(screen.getByText("45 minutes")).toBeTruthy();
    expect(screen.getByText("postgres")).toBeTruthy();
    expect(screen.getByRole("button", { name: /start session/i })).toBeTruthy();
  });

  it("shows not found with link back on 404", async () => {
    fetchMock.mockResolvedValueOnce(json(404, { error: { message: "nope" } }));
    render(<BriefClient scenarioId="zz" />);
    expect(await screen.findByText("Scenario not found")).toBeTruthy();
    // next/link applies trailingSlash from next.config only at build time.
    expect(screen.getByRole("link", { name: /back to scenarios/i }).getAttribute("href")).toMatch(
      /^\/simulator\/?$/,
    );
  });

  it("posts anonymously, records one Local_Progress entry and navigates on 201", async () => {
    const key = "k".repeat(43);
    fetchMock
      .mockResolvedValueOnce(json(200, brief))
      .mockResolvedValueOnce(json(201, { sessionId: key }));
    render(<BriefClient scenarioId="fx" />);
    fireEvent.click(await screen.findByRole("button", { name: /start session/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/simulator/fx/run/?session=${key}`));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/api/v1/sessions");
    expect(init.method).toBe("POST");
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
    // The request body carries no Local_Progress data.
    expect(init.body).toBe(JSON.stringify({ scenarioId: "fx" }));
    expect(localStorage.getItem(LOCAL_PROGRESS_KEY)).not.toBeNull();
    const entries = readProgress(localStorage);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      sessionKey: key,
      scenarioId: "fx",
      scenarioTitle: "Database Failover",
    });
    expect(Number.isNaN(Date.parse(entries[0]!.startedAt))).toBe(false);
  });

  it("shows API errors in an alert and does not record progress", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, brief))
      .mockResolvedValueOnce(json(500, { error: { message: "Boom" } }));
    render(<BriefClient scenarioId="fx" />);
    fireEvent.click(await screen.findByRole("button", { name: /start session/i }));
    expect(await screen.findByText("Boom")).toBeTruthy();
    expect(screen.queryByText(/sign in/i)).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(readProgress(localStorage)).toEqual([]);
  });
});
