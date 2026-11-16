import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildContentBundle, ContentBundleError, type RawContentFile } from "./build-bundle.js";
import { createDefaultRubric } from "../modules/scoring-debrief/index.js";
import type { ScenarioContentFile } from "../types/index.js";

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), relative), "utf8"));
}

const scenario = readJson(
  "content/scenarios/scenario-kinesis-2021-v1@1.0.0.json",
) as ScenarioContentFile;
const rubric = readJson("content/rubrics/1.0.0.json");

function scenarioFile(file: string, overrides: Partial<ScenarioContentFile> = {}): RawContentFile {
  return { file, data: { ...scenario, ...overrides } };
}

describe("buildContentBundle", () => {
  it("bundles every scenario version and rubric", () => {
    const bundle = buildContentBundle(
      {
        scenarios: [
          scenarioFile("a.json"),
          scenarioFile("b.json", { version: "1.2.0" }),
          scenarioFile("c.json", { version: "1.10.0" }),
        ],
        rubrics: [{ file: "r.json", data: rubric }],
        incidents: [],
      },
      "2025-01-01T00:00:00.000Z",
    );

    expect(bundle.generatedAt).toBe("2025-01-01T00:00:00.000Z");
    expect(bundle.scenarios.map((s) => s.version).sort()).toEqual(["1.0.0", "1.10.0", "1.2.0"]);
    expect(bundle.rubrics).toHaveLength(1);
  });

  it("fails on a duplicate (id, version) pair", () => {
    expect(() =>
      buildContentBundle({
        scenarios: [scenarioFile("a.json"), scenarioFile("b.json")],
        rubrics: [{ file: "r.json", data: rubric }],
        incidents: [],
      }),
    ).toThrow(/duplicate scenario \(id, version\) pair scenario-kinesis-2021-v1@1\.0\.0/);
  });

  it("fails on an unknown rubric_version", () => {
    const attempt = (): unknown =>
      buildContentBundle({
        scenarios: [scenarioFile("a.json", { rubric_version: "9.9.9" })],
        rubrics: [{ file: "r.json", data: rubric }],
        incidents: [],
      });
    expect(attempt).toThrow(ContentBundleError);
    expect(attempt).toThrow(/unknown rubric_version "9\.9\.9"/);
  });

  it("fails on an invalid scenario file", () => {
    expect(() =>
      buildContentBundle({
        scenarios: [{ file: "bad.json", data: { id: "x" } }],
        rubrics: [{ file: "r.json", data: rubric }],
        incidents: [],
      }),
    ).toThrow(/bad\.json: not a valid scenario content file/);
  });

  it("keeps content/rubrics/1.0.0.json in sync with createDefaultRubric()", () => {
    expect(rubric).toEqual(createDefaultRubric());
  });
});
