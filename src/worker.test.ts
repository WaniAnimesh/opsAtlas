import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import worker, { type Env, type WorkerExecutionContext } from "./worker.js";
import { createTestD1, type TestD1 } from "./test-support/d1.js";
import { FIXTURE_SCENARIO, makeEvent, makeSession } from "./test-support/repository-contract.js";
import { D1SimulationRuntimeRepository } from "./modules/simulation-runtime/d1-repository.js";

let d1: TestD1;
let allow = true;
const limitedKeys: string[] = [];

function env(): Env {
  return {
    DB: d1.db,
    RATE_LIMITER: {
      limit: async ({ key }) => {
        limitedKeys.push(key);
        return { success: allow };
      },
    },
    ALLOWED_ORIGINS: "https://opsatlas.pages.dev",
  };
}

function context(): WorkerExecutionContext & { waited: Promise<unknown>[] } {
  const waited: Promise<unknown>[] = [];
  return {
    waited,
    waitUntil: (promise) => void waited.push(promise),
    passThroughOnException: () => undefined,
    props: {},
  };
}

async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`https://api.example${path}`, init), env(), context());
}

beforeAll(async () => {
  d1 = await createTestD1();
}, 60_000);

afterAll(async () => {
  await d1.dispose();
});

beforeEach(async () => {
  allow = true;
  limitedKeys.length = 0;
  await d1.reset();
});

describe("worker.fetch", () => {
  it("serves the health endpoint without consulting the rate limiter", async () => {
    const res = await fetchWorker("/api/v1/health");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("ok");
    expect(limitedKeys).toEqual([]);
  });

  it("keys the rate limiter by CF-Connecting-IP and maps a rejection to 429", async () => {
    const ok = await fetchWorker("/api/v1/scenarios", {
      headers: { "CF-Connecting-IP": "203.0.113.7" },
    });
    expect(ok.status).toBe(200);
    expect(limitedKeys).toEqual(["ip:203.0.113.7"]);

    allow = false;
    const limited = await fetchWorker("/api/v1/scenarios");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(((await limited.json()) as { error: { code: string } }).error.code).toBe(
      "RATE_LIMIT_EXCEEDED",
    );
  });

  it("lists bundled scenarios and starts a session stored in D1", async () => {
    const list = (await (await fetchWorker("/api/v1/scenarios")).json()) as { id: string }[];
    expect(list.map((s) => s.id)).toContain(FIXTURE_SCENARIO.id);

    const created = await fetchWorker("/api/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: FIXTURE_SCENARIO.id, scenarioVersion: "1.0.0" }),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(id).toHaveLength(43);

    const fetched = await fetchWorker(`/api/v1/sessions/${id}`);
    expect(fetched.status).toBe(200);
    const row = await d1.db
      .prepare("SELECT COUNT(*) AS n FROM scenario_sessions WHERE id = ?")
      .bind(id)
      .first<{ n: number }>();
    expect(row?.n).toBe(1);

    const unknown = await fetchWorker("/api/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: FIXTURE_SCENARIO.id, scenarioVersion: "9.9.9" }),
    });
    expect(unknown.status).toBe(404);
  });

  it("sends CORS headers only for allowlisted origins", async () => {
    const allowed = await fetchWorker("/api/v1/health", {
      headers: { Origin: "https://opsatlas.pages.dev" },
    });
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://opsatlas.pages.dev");
    const other = await fetchWorker("/api/v1/health", {
      headers: { Origin: "https://evil.example" },
    });
    expect(other.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("worker.scheduled", () => {
  it("purges sessions inactive for more than 30 days via ctx.waitUntil", async () => {
    const repo = new D1SimulationRuntimeRepository(d1.db);
    await repo.saveScenarioVersion(FIXTURE_SCENARIO);
    const stale = makeSession(1, { startedAt: "2025-01-01T00:00:00.000Z" });
    const fresh = makeSession(2, { startedAt: "2025-02-10T00:00:00.000Z" });
    await repo.createSession(stale, makeEvent(stale, 0));
    await repo.createSession(fresh, makeEvent(fresh, 0));

    const ctx = context();
    worker.scheduled({ scheduledTime: Date.parse("2025-02-15T03:00:00.000Z") }, env(), ctx);

    expect(ctx.waited).toHaveLength(1);
    await Promise.all(ctx.waited);
    await expect(repo.getSession(stale.id)).resolves.toBeNull();
    await expect(repo.getSession(fresh.id)).resolves.not.toBeNull();
  });
});
