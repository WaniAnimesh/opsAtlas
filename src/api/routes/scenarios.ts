import { Hono } from "hono";
import { scenarioVersionNotFound } from "../errors.js";
import type { ScenarioCatalogService } from "../../modules/scenario-catalog/index.js";

const SCENARIO_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Creates the public scenario catalog routes.
 *
 * The service is injectable so the HTTP boundary can be tested independently
 * from content storage while the default export serves local production use.
 */
export function createScenarioCatalogRoutes(service: ScenarioCatalogService): Hono {
  const routes = new Hono();

  routes.get("/", async (c) => {
    const scenarios = await service.listPublished();
    return c.json(scenarios, 200);
  });

  routes.get("/:id/brief", async (c) => {
    const id = c.req.param("id");
    if (!SCENARIO_ID_PATTERN.test(id)) {
      const { statusCode, body } = scenarioVersionNotFound();
      return c.json(body, statusCode as Parameters<typeof c.json>[1]);
    }

    const scenario = await service.getScenarioBrief(id);
    if (scenario === null) {
      const { statusCode, body } = scenarioVersionNotFound();
      return c.json(body, statusCode as Parameters<typeof c.json>[1]);
    }

    return c.json(scenario, 200);
  });

  return routes;
}
