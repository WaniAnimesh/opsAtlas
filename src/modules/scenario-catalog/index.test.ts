import {
  BundledScenarioRepository,
  ScenarioCatalog,
  compareSemver,
  type ScenarioRepository,
} from "./index.js";
import { FileScenarioRepository } from "./file-repository.js";
import type { ScenarioContentFile } from "../../types/index.js";

const fixtureId = "scenario-kinesis-2021-v1";

function scenarioFixture(id = "scenario-test-v1", version = "1.0.0"): ScenarioContentFile {
  return {
    id,
    incident_slug: "incident-test",
    title: "Test scenario",
    objective: "Practice a safe response.",
    difficulty: "beginner",
    est_duration_min: 5,
    rubric_version: "1.0.0",
    skill_tags: ["observability"],
    version,
    definition: {
      initial_state_id: "initial",
      states: {},
      actions: {},
      transitions: [],
      evidence: {},
    },
  };
}

describe("ScenarioCatalog", () => {
  it("lists valid local content and exposes the catalog fields", async () => {
    const catalog = new ScenarioCatalog(new FileScenarioRepository());
    const scenarios = await catalog.listPublished();

    expect(scenarios).toContainEqual({
      id: fixtureId,
      incident_slug: "aws-us-east-1-2021-kinesis",
      title: "Kinesis Cascade: Diagnosing a Control Plane Failure",
      objective:
        "Identify the root cause of a cascading AWS service failure and apply correct mitigation before customer impact exceeds the SLO threshold.",
      difficulty: "intermediate",
      est_duration_min: 45,
      skill_tags: [
        "capacity-management",
        "cascading-failures",
        "observability",
        "cloud-operations",
      ],
      version: "1.0.0",
    });
  });

  it("returns a brief for a known id and null for unknown or unsafe ids", async () => {
    const catalog = new ScenarioCatalog(new FileScenarioRepository());
    const brief = await catalog.getScenarioBrief(fixtureId);

    expect(brief?.id).toBe(fixtureId);
    expect(brief?.difficulty).toBe("intermediate");
    await expect(catalog.getScenarioBrief("does-not-exist")).resolves.toBeNull();
    await expect(catalog.getScenarioBrief("../package")).resolves.toBeNull();
    await expect(catalog.getScenarioBrief("nested/scenario")).resolves.toBeNull();
  });

  it("supports an alternate repository without coupling the service to storage", async () => {
    const scenario = scenarioFixture();
    const repository: ScenarioRepository = {
      listPublished: async () => [scenario],
      getById: async (id) => (id === scenario.id ? scenario : null),
      getVersion: async (id, version) =>
        id === scenario.id && version === scenario.version ? scenario : null,
    };
    const catalog = new ScenarioCatalog(repository);

    await expect(catalog.listPublished()).resolves.toEqual([
      {
        id: scenario.id,
        incident_slug: scenario.incident_slug,
        title: scenario.title,
        objective: scenario.objective,
        difficulty: scenario.difficulty,
        est_duration_min: scenario.est_duration_min,
        skill_tags: scenario.skill_tags,
        version: scenario.version,
      },
    ]);
  });

  it("file repository resolves the exact version of the fixture", async () => {
    const repository = new FileScenarioRepository();
    expect((await repository.getVersion(fixtureId, "1.0.0"))?.version).toBe("1.0.0");
    await expect(repository.getVersion(fixtureId, "9.9.9")).resolves.toBeNull();
  });
});

describe("latest-version selection", () => {
  const versions = ["1.0.0", "1.10.0", "1.2.0"].map((v) => scenarioFixture("scenario-a", v));
  const bundle = { scenarios: [...versions, scenarioFixture("scenario-b", "2.0.0")] };

  it("orders semver numerically", () => {
    expect(compareSemver("1.10.0", "1.2.0")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
  });

  it("lists only the highest version per id and resolves getById to it", async () => {
    const repository = new BundledScenarioRepository(bundle);
    const listed = await repository.listPublished();

    expect(listed.map((s) => `${s.id}@${s.version}`)).toEqual([
      "scenario-a@1.10.0",
      "scenario-b@2.0.0",
    ]);
    expect((await repository.getById("scenario-a"))?.version).toBe("1.10.0");
  });

  it("still resolves an older pinned version and rejects unknown ones", async () => {
    const repository = new BundledScenarioRepository(bundle);

    expect((await repository.getVersion("scenario-a", "1.0.0"))?.version).toBe("1.0.0");
    await expect(repository.getVersion("scenario-a", "3.0.0")).resolves.toBeNull();
    await expect(repository.getVersion("missing", "1.0.0")).resolves.toBeNull();
  });
});
