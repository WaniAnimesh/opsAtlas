import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ScenarioContentFile, ScenarioDefinition } from "../../types/index.js";
import { createDefaultRubric } from "../scoring-debrief/index.js";
import { validateScenarioDefinition } from "./index.js";

const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "content/scenarios/scenario-kinesis-2021-v1@1.0.0.json"),
    "utf8",
  ),
) as ScenarioContentFile;
const rubric = createDefaultRubric();
const fresh = (): ScenarioDefinition => structuredClone(fixture.definition);

describe("validateScenarioDefinition", () => {
  it("passes the example fixture with the default rubric", () => {
    expect(validateScenarioDefinition(fresh(), rubric)).toEqual({ valid: true, violations: [] });
  });

  it("reports invalid-reference for missing states and unknown actions", () => {
    const d = fresh();
    d.transitions.push({
      from_state_id: "ghost-a",
      trigger: "action-nope",
      guard: null,
      to_state_id: "ghost-b",
      effects: [],
      delayed_effects: [],
    });
    d.initial_state_id = "ghost-init";
    const r = validateScenarioDefinition(d, rubric);
    const ids = r.violations
      .filter((v) => v.category === "invalid-reference")
      .map((v) => v.stateOrActionId);
    expect(ids).toEqual(["action-nope", "ghost-a", "ghost-b", "ghost-init"]);
    expect(r.valid).toBe(false);
  });

  it("reports unreachable-state", () => {
    const d = fresh();
    d.states["orphan"] = { ...structuredClone(d.states["state-normal"]!), id: "orphan" };
    const r = validateScenarioDefinition(d, rubric);
    expect(r.violations).toEqual([
      expect.objectContaining({ category: "unreachable-state", stateOrActionId: "orphan" }),
    ]);
  });

  it("reports missing-debrief for terminal states without mapping", () => {
    const r = validateScenarioDefinition(fresh(), { terminalStates: {} });
    expect(r.violations).toEqual([
      expect.objectContaining({ category: "missing-debrief", stateOrActionId: "state-mitigated" }),
    ]);
  });

  it("reports incomplete-action only for transition-referenced actions", () => {
    const d = fresh();
    const a = d.actions["action-scale-kinesis"]!;
    a.rationale_options = [];
    a.time_cost = -1;
    // unreferenced action may be incomplete without a violation
    d.actions["action-declare-incident"]!.rationale_options = [];
    const r = validateScenarioDefinition(d, rubric);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]).toMatchObject({
      category: "incomplete-action",
      stateOrActionId: "action-scale-kinesis",
    });
  });

  it("collects all violations in deterministic category/id order, and is cycle-safe", () => {
    const d = fresh();
    d.transitions.push({
      from_state_id: "state-mitigated",
      trigger: "time_elapsed",
      guard: null,
      to_state_id: "state-normal",
      effects: [],
      delayed_effects: [],
    });
    d.states["orphan"] = { ...structuredClone(d.states["state-normal"]!), id: "orphan" };
    d.actions["action-scale-kinesis"]!.effects = undefined as never;
    const r = validateScenarioDefinition(d, { terminalStates: {} });
    expect(r.violations.map((v) => v.category)).toEqual([
      "incomplete-action",
      "missing-debrief",
      "unreachable-state",
    ]);
    expect(validateScenarioDefinition(d, { terminalStates: {} })).toEqual(r);
  });
});
