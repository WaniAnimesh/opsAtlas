// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readScenarioIds } from "./scenarioIds";
import { generateStaticParams } from "./page";

const tmp = mkdtempSync(path.join(os.tmpdir(), "scn-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("readScenarioIds", () => {
  it("uses embedded ids, not file names, and skips invalid ones", () => {
    writeFileSync(path.join(tmp, "file-name.json"), JSON.stringify({ id: "embedded-id_1" }));
    writeFileSync(path.join(tmp, "noid.json"), JSON.stringify({ title: "x" }));
    writeFileSync(path.join(tmp, "bad.json"), JSON.stringify({ id: "../evil" }));
    writeFileSync(path.join(tmp, "broken.json"), "{not json");
    writeFileSync(path.join(tmp, "note.txt"), "x");
    expect(readScenarioIds(tmp)).toEqual(["embedded-id_1"]);
  });
});

describe("generateStaticParams", () => {
  it("returns embedded ids from content/scenarios", () => {
    const params = generateStaticParams();
    expect(params).toContainEqual({ id: "scenario-kinesis-2021-v1" });
    expect(params).not.toContainEqual({ id: "example-fixture" });
  });
});
