import { Hono } from "hono";
import { incidentNotFound, invalidInput } from "../errors.js";
import type {
  IncidentCatalogService,
  IncidentFilters,
} from "../../modules/incident-catalog/index.js";
import { MAX_SEARCH_LENGTH, MAX_TEXT_LENGTH } from "../middleware/validation.js";

const FILTER_NAMES = ["provider", "technology", "failure_domain", "severity"] as const;
type FilterName = (typeof FILTER_NAMES)[number];

type IncidentQuery = Record<string, string[]>;

function filterValue(values: string[]): string | readonly string[] {
  return values.length === 1 && values[0] !== undefined ? values[0] : values;
}

function parseFilters(query: IncidentQuery): IncidentFilters {
  const filters: IncidentFilters = {};

  for (const name of FILTER_NAMES) {
    const values = query[name];
    if (values !== undefined) {
      filters[name as FilterName] = filterValue(values);
    }
  }

  return filters;
}

function queryValidationError(query: IncidentQuery): string | null {
  const searchValues = query["q"] ?? [];
  if (searchValues.some((value) => value.length > MAX_SEARCH_LENGTH)) {
    return `q: must contain at most ${MAX_SEARCH_LENGTH} characters`;
  }

  for (const name of FILTER_NAMES) {
    if ((query[name] ?? []).some((value) => value.length > MAX_TEXT_LENGTH)) {
      return `${name}: must contain at most ${MAX_TEXT_LENGTH} characters`;
    }
  }

  return null;
}

/** Creates public HTTP routes for the file-backed incident catalog. */
export function createIncidentCatalogRoutes(service: IncidentCatalogService): Hono {
  const routes = new Hono();

  routes.get("/", async (c) => {
    const query = c.req.queries() as IncidentQuery;
    const validationError = queryValidationError(query);
    if (validationError !== null) {
      const { statusCode, body } = invalidInput(validationError);
      return c.json(body, statusCode as Parameters<typeof c.json>[1]);
    }

    const queryText = query["q"]?.[0] ?? "";
    const filters = parseFilters(query);
    const incidents =
      queryText.trim().length > 0
        ? await service.search(queryText, filters)
        : await service.listPublished(filters);

    return c.json(incidents, 200);
  });

  routes.get("/:slug", async (c) => {
    const incident = await service.getBySlug(c.req.param("slug"));
    if (incident === null) {
      const { statusCode, body } = incidentNotFound();
      return c.json(body, statusCode as Parameters<typeof c.json>[1]);
    }

    return c.json(incident, 200);
  });

  return routes;
}
