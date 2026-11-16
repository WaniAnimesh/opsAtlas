import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_PROGRESS_KEY, readProgress } from "../../../../lib/local-progress";
import { DebriefClient } from "./DebriefClient";

const { push, router } = vi.hoisted(() => {
  const p = vi.fn();
  return { push: p, router: { push: p } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams("session=s1"),
}));

const labels = {
  impactControl: "Impact Control",
  diagnosticQuality: "Diagnostic Quality",
  riskManagement: "Risk Management",
  recoveryQuality: "Recovery Quality",
  communication: "Communication",
  learningReflection: "Learning/Reflection",
};
const scores = {
  impactControl: 1,
  diagnosticQuality: 2,
  riskManagement: 3,
  recoveryQuality: 4,
  communication: 5,
  learningReflection: 6,
};
const feedback = Object.fromEntries(
  Object.keys(labels).map((k) => [k, `fb-${k}`]),
) as Record<string, string>;

const debrief = {
  sessionId: "s1",
  scenarioId: "fx",
  scenarioVersion: "2.1.0",
  sessionStatus: "completed",
  endedAt: "2025-01-01T00:00:00.000Z",
  incidentSlug: "gh-2018",
  maxScore: 10,
  scores,
  labels,
  feedback,
  terminalOutcome: "resolved",
  terminalDebrief: "Well done.",
};

function stepBody(n: number): unknown {
  return {
    step: n,
    totalSteps: 2,
    sequencePos: n + 1,
    eventType: "action",
    simTime: n,
    actionId: `a${n}`,
    evidenceId: null,
    state: {
      id: `state-${n}`,
      is_terminal: false,
      service_health: { api: "degraded" },
      metrics: {},
      dependencies: {},
      customer_impact: "slow",
      evidence_available: [],
      active_alerts: [],
    },
    revealedEvidence: [{ evidenceId: "ev-r", category: "logs", type: "text" }],
    unrequestedEvidence: [{ evidenceId: "ev-u", category: "metrics", type: "chart" }],
    alternatives:
      n === 0 ? [{ kind: "action", id: "alt", label: "Alt", description: "Try this instead." }] : [],
    noAlternativesNote: n === 0 ? null : "No alternatives defined here.",
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

const NEW_KEY = "n".repeat(43);
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  push.mockReset();
  localStorage.clear();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return json(201, { sessionId: NEW_KEY });
    if (url.endsWith("/debrief")) return json(200, debrief);
    const m = /steps\/(\d+)$/.exec(url);
    return json(200, stepBody(Number(m?.[1] ?? 0)));
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DebriefClient", () => {
  it("shows six labelled scores and no composite", async () => {
    render(<DebriefClient scenarioId="fx" />);
    for (const label of Object.values(labels)) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
    expect(screen.getByText("3 / 10", { exact: false })).toBeTruthy();
    expect(screen.getByText("fb-communication")).toBeTruthy();
    expect(screen.getAllByRole("term")).toHaveLength(6);
    expect(document.body.textContent ?? "").not.toMatch(/total|overall|composite/i);
  });

  it("navigates replay steps and shows unrequested evidence and alternatives", async () => {
    render(<DebriefClient scenarioId="fx" />);
    expect(await screen.findByText("Step 1 of 2")).toBeTruthy();
    expect(screen.getByText(/ev-u/)).toBeTruthy();
    expect(screen.getByText("Try this instead.", { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Step 2 of 2")).toBeTruthy();
    expect(await screen.findByText("No alternatives defined here.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Step 1 of 2")).toBeTruthy();
  });

  it("links to the source incident", async () => {
    render(<DebriefClient scenarioId="fx" />);
    const link = await screen.findByRole("link", { name: /source incident/i });
    expect(link.getAttribute("href")).toMatch(/^\/atlas\/incidents\/gh-2018\/?$/);
  });

  it("shows a message with a link back on 409", async () => {
    fetchMock.mockImplementation(async () =>
      json(409, { error: { code: "SESSION_NOT_CONCLUDED", message: "Not concluded yet." } }),
    );
    render(<DebriefClient scenarioId="fx" />);
    expect(await screen.findByText("Not concluded yet.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /back to the session/i }).getAttribute("href"),
    ).toMatch(/^\/simulator\/fx\/run\/?\?session=s1$/);
  });

  it("shows not found on 404 and has no sign-in prompt", async () => {
    fetchMock.mockImplementation(async () => json(404, { error: { message: "gone" } }));
    render(<DebriefClient scenarioId="fx" />);
    expect(await screen.findByText("Session not found")).toBeTruthy();
    expect(screen.queryByText(/sign in/i)).toBeNull();
  });

  it("retry pins the scenario version, records the new session and opens its run page", async () => {
    render(<DebriefClient scenarioId="fx" />);
    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/simulator/fx/run/?session=${NEW_KEY}`),
    );
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({
      scenarioId: "fx",
      scenarioVersion: "2.1.0",
    });
    expect(localStorage.getItem(LOCAL_PROGRESS_KEY)).not.toBeNull();
    expect(readProgress(localStorage).map((e) => e.sessionKey)).toEqual([NEW_KEY]);
  });
});
