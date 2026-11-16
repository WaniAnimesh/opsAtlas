import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunClient } from "./RunClient";

const { push, router } = vi.hoisted(() => {
  const p = vi.fn();
  return { push: p, router: { push: p } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams("session=s1"),
}));

const baseState = {
  id: "start",
  is_terminal: false,
  service_health: { api: "degraded" },
  metrics: { error_rate: 12 },
  dependencies: {},
  customer_impact: "Checkout is slow",
  evidence_available: ["ev-1"],
  active_alerts: ["HighErrorRate"],
};

const options = {
  sessionId: "s1",
  status: "active",
  stateId: "start",
  actions: [
    {
      id: "blocked",
      label: "Failover",
      time_cost: 2,
      reversible: true,
      rationale_options: ["r1"],
      available: false,
      unmetPreconditions: ['service_health.api eq "down"'],
    },
    {
      id: "wipe",
      label: "Wipe cache",
      time_cost: 1,
      reversible: false,
      rationale_options: ["Clear stale data", "Other"],
      available: true,
      unmetPreconditions: [],
      modifiedAttributes: ["metrics.cache", "customer_impact"],
    },
  ],
  evidence: [{ id: "ev-1", type: "logs", category: "Observable", time_cost: 1, requested: false }],
};

let status = "active";
let calls: { url: string; method: string; body?: string }[];
let evidenceResponse: unknown;
let sessionStatus = 200;

function json(code: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status: code });
}

beforeEach(() => {
  push.mockReset();
  status = "active";
  sessionStatus = 200;
  calls = [];
  evidenceResponse = { evidenceId: "ev-1", status: "unavailable" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, ...(init?.body ? { body: String(init.body) } : {}) });
      if (url.endsWith("/options")) return json(200, { ...options, status });
      if (url.endsWith("/evidence")) return json(200, evidenceResponse);
      if (method === "POST") {
        if (url.endsWith("/pause")) status = "paused";
        if (url.endsWith("/actions")) status = "completed";
        return json(200, {});
      }
      if (sessionStatus !== 200) return json(sessionStatus, { error: { message: "nope" } });
      return json(200, { id: "s1", status, simTimeElapsed: 7, state: baseState });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RunClient", () => {
  it("renders state, sim time label and a disabled action with its precondition", async () => {
    render(<RunClient scenarioId="fx" />);
    expect(await screen.findByText("Checkout is slow")).toBeTruthy();
    expect(screen.getByText("HighErrorRate")).toBeTruthy();
    expect(screen.getByText("error_rate")).toBeTruthy();
    expect(screen.getByText("Simulated time (not wall-clock time)")).toBeTruthy();
    expect(
      screen.getByRole("timer", { name: "Simulated time (not wall-clock time)" }),
    ).toBeTruthy();
    const btn = screen.getByRole("button", { name: /Perform Failover/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/service_health\.api eq/)).toBeTruthy();
  });

  it("requires confirmation for irreversible actions; Escape cancels", async () => {
    render(<RunClient scenarioId="fx" />);
    fireEvent.click(await screen.findByRole("button", { name: /Perform Wipe cache/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("metrics.cache")).toBeTruthy();
    expect(within(dialog).getByText(/cannot be undone/i)).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.some((c) => c.url.endsWith("/actions"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Perform Wipe cache/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/actions"))).toBe(true));
    const post = calls.find((c) => c.url.endsWith("/actions"))!;
    expect(JSON.parse(post.body!)).toEqual({ actionId: "wipe", rationale: "Clear stale data" });
    // action concluded the session -> debrief
    await waitFor(() => expect(push).toHaveBeenCalledWith("/simulator/fx/debrief/?session=s1"));
  });

  it("shows unavailable evidence explicitly", async () => {
    render(<RunClient scenarioId="fx" />);
    fireEvent.click(await screen.findByRole("button", { name: /Request ev-1/ }));
    expect(await screen.findByText("Evidence ev-1 is unavailable.")).toBeTruthy();
  });

  it("shows Paused and disables action/evidence controls", async () => {
    render(<RunClient scenarioId="fx" />);
    fireEvent.click(await screen.findByRole("button", { name: "Pause" }));
    expect(await screen.findByText("Paused")).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /Perform Wipe cache/ }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    expect(
      (screen.getByRole("button", { name: /Request ev-1/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
  });

  it("navigates to the debrief when the session is already terminal", async () => {
    status = "timed_out";
    render(<RunClient scenarioId="fx" />);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/simulator/fx/debrief/?session=s1"));
  });

  it("sends no Authorization header and shows not-found on 404", async () => {
    render(<RunClient scenarioId="fx" />);
    await screen.findByText("Checkout is slow");
    const fetchFn = globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } };
    for (const [, init] of fetchFn.mock.calls) {
      expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization/i);
    }
    cleanup();
    sessionStatus = 404;
    render(<RunClient scenarioId="fx" />);
    expect(await screen.findByText("Session not found")).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to scenarios/i })).toBeTruthy();
  });
});
