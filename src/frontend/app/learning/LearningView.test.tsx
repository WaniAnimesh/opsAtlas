import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_PROGRESS_KEY, addProgress, readProgress } from "../../lib/local-progress";
import type { ProgressStore } from "../../lib/local-progress";
import { LearningView } from "./LearningView";

const K1 = "a".repeat(43);
const K2 = "b".repeat(43);
const K3 = "c".repeat(43);

function debrief(over: Record<string, unknown>, score: number): unknown {
  return {
    sessionId: "x",
    scenarioId: "a",
    scenarioVersion: "1.0.0",
    sessionStatus: "completed",
    endedAt: "2024-02-02T10:00:00.000Z",
    incidentSlug: "i",
    maxScore: 10,
    scores: {
      impactControl: score,
      diagnosticQuality: score,
      riskManagement: score,
      recoveryQuality: score,
      communication: score,
      learningReflection: score,
    },
    ...over,
  };
}

function seed(): void {
  addProgress(localStorage, {
    sessionKey: K1,
    scenarioId: "a",
    scenarioTitle: "Older Scenario",
    startedAt: "2024-01-01T00:00:00.000Z",
  });
  addProgress(localStorage, {
    sessionKey: K2,
    scenarioId: "a",
    scenarioTitle: "Older Scenario",
    startedAt: "2024-02-01T00:00:00.000Z",
  });
}

function mockDebriefs(byKey: Record<string, { status: number; body: unknown }>): ReturnType<typeof vi.fn> {
  const f = vi.fn((url: string) => {
    const key = Object.keys(byKey).find((k) => url.includes(k));
    const r = key ? byKey[key]! : { status: 404, body: { error: { message: "nope" } } };
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status }));
  });
  vi.stubGlobal("fetch", f);
  return f;
}

describe("LearningView", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the empty state and device-only notice without calling the API", async () => {
    const f = mockDebriefs({});
    render(<LearningView skillTagsByScenario={{}} />);
    expect(await screen.findByText(/no sessions on this device yet/i)).toBeTruthy();
    expect(screen.getByText(/stored only on this device/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Skill map" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Trends" })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("renders history newest first, skill map meter and trends from fetched debriefs", async () => {
    seed();
    const f = mockDebriefs({
      [K1]: { status: 200, body: debrief({ endedAt: "2024-01-01T10:00:00.000Z" }, 4) },
      [K2]: { status: 200, body: debrief({ sessionStatus: "timed_out" }, 6) },
    });
    render(<LearningView skillTagsByScenario={{ a: ["triage"] }} />);
    const list = await screen.findByRole("list", { name: /sessions, newest first/i });
    expect(within(list).getAllByText("2024-02-02")).toHaveLength(1);
    expect(within(list).getAllByText("2024-01-01")).toHaveLength(1);
    const meter = screen.getByRole("meter");
    expect(meter.getAttribute("aria-valuenow")).toBe("3");
    expect(screen.getByText("3.0 / 5")).toBeTruthy();
    const trends = screen.getByRole("heading", { name: "Trends" }).closest("section") as HTMLElement;
    expect(within(trends).getAllByText("up")).toHaveLength(6);
    expect(f).toHaveBeenCalledTimes(2);
    for (const [, init] of f.mock.calls as [string, RequestInit?][]) {
      expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization/i);
    }
  });

  it("marks sessions that cannot be fetched as no longer available and keeps them out of the skill map", async () => {
    seed();
    mockDebriefs({
      [K1]: { status: 404, body: { error: { message: "nope" } } },
      [K2]: { status: 404, body: { error: { message: "nope" } } },
    });
    render(<LearningView skillTagsByScenario={{ a: ["triage"] }} />);
    expect(await screen.findAllByText(/no longer available/i)).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Skill map" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Trends" })).toBeNull();
  });

  it("does not show trends for a single completed session", async () => {
    addProgress(localStorage, {
      sessionKey: K3,
      scenarioId: "a",
      scenarioTitle: "Solo",
      startedAt: "2024-03-01T00:00:00.000Z",
    });
    mockDebriefs({ [K3]: { status: 200, body: debrief({}, 5) } });
    render(<LearningView skillTagsByScenario={{ a: ["triage"] }} />);
    await screen.findByRole("heading", { name: "Skill map" });
    expect(screen.queryByRole("heading", { name: "Trends" })).toBeNull();
  });

  it("Clear my progress empties storage, shows the empty state and makes no further request", async () => {
    seed();
    const f = mockDebriefs({
      [K1]: { status: 200, body: debrief({}, 4) },
      [K2]: { status: 200, body: debrief({}, 6) },
    });
    render(<LearningView skillTagsByScenario={{}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Clear my progress" }));
    expect(await screen.findByText(/no sessions on this device yet/i)).toBeTruthy();
    expect(localStorage.getItem(LOCAL_PROGRESS_KEY)).toBeNull();
    expect(readProgress(localStorage)).toEqual([]);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("shows a notice when storage is unavailable", async () => {
    const memory = new Map<string, string>();
    const store: ProgressStore & { degraded: boolean } = {
      degraded: true,
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => void memory.set(k, v),
      removeItem: (k) => void memory.delete(k),
    };
    render(<LearningView skillTagsByScenario={{}} store={store} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/cannot be saved/i));
  });

  it("has no sign-in prompt", async () => {
    render(<LearningView skillTagsByScenario={{}} />);
    await screen.findByText(/no sessions on this device yet/i);
    expect(document.body.textContent ?? "").not.toMatch(/sign[- ]in/i);
  });
});
