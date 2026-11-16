import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type {
  ScenarioBrief,
  ScenarioCatalogService,
  ScenarioSummary,
} from "../../modules/scenario-catalog/index.js";
import { createScenarioCatalogRoutes } from "./scenarios.js";

const summary: ScenarioSummary = {
  id: "scenario-1",
  incident_slug: "incident-1",
  title: "Scenario One",
  objective: "Practice diagnosing the incident.",
  difficulty: "beginner",
  est_duration_min: 15,
  skill_tags: ["observability"],
  version: "1.0.0",
};

const brief: ScenarioBrief = summary;

function createTestApp(service: ScenarioCatalogService): Hono {
  const app = new Hono();
  app.route("/api/v1/scenarios", createScenarioCatalogRoutes(service));
  return app;
}

describe("scenario catalog HTTP routes", () => {
  it("returns published scenario summaries with HTTP 200", async () => {
    const service: ScenarioCatalogService = {
      listPublished: vi.fn(async () => [summary]),
      getScenarioBrief: vi.fn(),
    };
    const app = createTestApp(service);

    const response = await app.request("/api/v1/scenarios");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([summary]);
    expect(service.listPublished).toHaveBeenCalledOnce();
  });

  it("returns a scenario brief with HTTP 200", async () => {
    const service: ScenarioCatalogService = {
      listPublished: vi.fn(),
      getScenarioBrief: vi.fn(async () => brief),
    };
    const app = createTestApp(service);

    const response = await app.request("/api/v1/scenarios/scenario-1/brief");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(brief);
    expect(service.getScenarioBrief).toHaveBeenCalledWith("scenario-1");
  });

  it("returns the structured not-found error for a missing brief", async () => {
    const service: ScenarioCatalogService = {
      listPublished: vi.fn(),
      getScenarioBrief: vi.fn(async () => null),
    };
    const app = createTestApp(service);

    const response = await app.request("/api/v1/scenarios/missing/brief");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "SCENARIO_VERSION_NOT_FOUND",
        message: "The requested scenario version was not found.",
      },
    });
  });

  it("rejects invalid or traversal-like IDs without calling the service", async () => {
    const service: ScenarioCatalogService = {
      listPublished: vi.fn(),
      getScenarioBrief: vi.fn(),
    };
    const app = createTestApp(service);

    const response = await app.request("/api/v1/scenarios/%2E%2E%2Fsecret/brief");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "SCENARIO_VERSION_NOT_FOUND",
        message: "The requested scenario version was not found.",
      },
    });
    expect(service.getScenarioBrief).not.toHaveBeenCalled();
  });
});
