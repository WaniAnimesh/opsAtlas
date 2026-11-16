import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type {
  IncidentCatalogService,
  IncidentDetail,
  IncidentSummary,
} from "../../modules/incident-catalog/index.js";
import { createIncidentCatalogRoutes } from "./incidents.js";

const summary: IncidentSummary = {
  slug: "example-incident",
  title: "Example Incident",
  org: "Example Provider",
  incident_date: "2024-01-02",
  summary: "A service outage caused by a retry storm.",
  failure_domain: "retry-storm",
  severity: "sev1",
  skill_tags: ["observability"],
};

const detail = {
  slug: summary.slug,
  title: summary.title,
  org: summary.org,
  incident_date: summary.incident_date,
  summary: summary.summary,
  impact: "Customers experienced elevated errors.",
  failure_domain: summary.failure_domain,
  severity: summary.severity,
  is_reconstruction: false,
  skill_tags: summary.skill_tags,
  sources: [],
  timeline: [],
  causal_factors: [],
  lessons: [],
} satisfies IncidentDetail;

function createTestApp(service: IncidentCatalogService): Hono {
  const app = new Hono();
  app.route("/api/v1/incidents", createIncidentCatalogRoutes(service));
  return app;
}

describe("incident catalog HTTP routes", () => {
  it("returns summaries from listPublished with HTTP 200", async () => {
    const service: IncidentCatalogService = {
      listPublished: vi.fn(async () => [summary]),
      search: vi.fn(),
      getBySlug: vi.fn(),
    };
    const app = createTestApp(service);

    const response = await app.request("/api/v1/incidents");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([summary]);
    expect(service.listPublished).toHaveBeenCalledWith({});
    expect(service.search).not.toHaveBeenCalled();
  });

  it("uses search and preserves repeated filter values", async () => {
    const service: IncidentCatalogService = {
      listPublished: vi.fn(),
      search: vi.fn(async () => [summary]),
      getBySlug: vi.fn(),
    };
    const app = createTestApp(service);

    const response = await app.request(
      "/api/v1/incidents?q=retry+storm&provider=AWS&provider=GCP&technology=postgres&failure_domain=retry-storm&severity=sev1",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([summary]);
    expect(service.search).toHaveBeenCalledWith("retry storm", {
      provider: ["AWS", "GCP"],
      technology: "postgres",
      failure_domain: "retry-storm",
      severity: "sev1",
    });
    expect(service.listPublished).not.toHaveBeenCalled();
  });

  it("returns complete incident detail with HTTP 200", async () => {
    const service: IncidentCatalogService = {
      listPublished: vi.fn(),
      search: vi.fn(),
      getBySlug: vi.fn(async () => detail),
    };
    const app = createTestApp(service);

    const response = await app.request("/api/v1/incidents/example-incident");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(detail);
    expect(service.getBySlug).toHaveBeenCalledWith("example-incident");
  });

  it("returns INCIDENT_NOT_FOUND for missing and unsafe slugs", async () => {
    const service: IncidentCatalogService = {
      listPublished: vi.fn(),
      search: vi.fn(),
      getBySlug: vi.fn(async () => null),
    };
    const app = createTestApp(service);

    const missingResponse = await app.request("/api/v1/incidents/missing");
    const unsafeResponse = await app.request("/api/v1/incidents/%2E%2E%2Fsecret");

    for (const response of [missingResponse, unsafeResponse]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "INCIDENT_NOT_FOUND",
          message: "The requested incident was not found.",
        },
      });
    }
    expect(service.getBySlug).toHaveBeenNthCalledWith(1, "missing");
    expect(service.getBySlug).toHaveBeenNthCalledWith(2, "../secret");
  });

  it("returns INVALID_INPUT when query limits are exceeded", async () => {
    const service: IncidentCatalogService = {
      listPublished: vi.fn(),
      search: vi.fn(),
      getBySlug: vi.fn(),
    };
    const app = createTestApp(service);

    const response = await app.request(`/api/v1/incidents?q=${"x".repeat(201)}`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_INPUT",
        message: "The request contains invalid input.",
        details: "q: must contain at most 200 characters",
      },
    });
    expect(service.listPublished).not.toHaveBeenCalled();
    expect(service.search).not.toHaveBeenCalled();
  });

  it("returns INVALID_INPUT when a text filter limit is exceeded", async () => {
    const service: IncidentCatalogService = {
      listPublished: vi.fn(),
      search: vi.fn(),
      getBySlug: vi.fn(),
    };
    const app = createTestApp(service);

    const response = await app.request(`/api/v1/incidents?provider=${"x".repeat(10_001)}`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_INPUT",
        message: "The request contains invalid input.",
        details: "provider: must contain at most 10000 characters",
      },
    });
    expect(service.listPublished).not.toHaveBeenCalled();
    expect(service.search).not.toHaveBeenCalled();
  });
});
