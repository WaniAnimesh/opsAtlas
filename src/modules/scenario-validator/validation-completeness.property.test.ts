import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ScenarioContentFile, ScenarioDefinition } from "../../types/index.js";
import { validateScenarioDefinition, type ViolationCategory } from "./validator.js";

// Feature: opsatlas-platform, Property 11: Scenario Validation Graph Completeness
// **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6**

const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "content/scenarios/scenario-kinesis-2021-v1@1.0.0.json"),
    "utf8",
  ),
) as ScenarioContentFile;
const stateTemplate = fixture.definition.states["state-normal"]!;
const actionTemplate = fixture.definition.actions["action-check-logs"]!;

const CATEGORIES: ViolationCategory[] = [
  "invalid-reference",
  "unreachable-state",
  "missing-debrief",
  "incomplete-action",
];
const BREAKS = ["no-rationale", "negative-time", "no-effects", "no-preconditions"] as const;
type Break = (typeof BREAKS)[number];

interface Plan {
  stateCount: number;
  actionCount: number;
  /** For state i>=1: [parent index (mod i), trigger selector]. */
  tree: Array<[number, number]>;
  extra: Array<[number, number, number]>;
  terminals: boolean[];
  hasDefects: boolean;
  ghostTo: number;
  ghostFrom: number;
  ghostAction: number;
  orphans: number;
  unmapped: number[];
  broken: Break[];
}

const planArb: fc.Arbitrary<Plan> = fc.record({
  stateCount: fc.integer({ min: 2, max: 7 }),
  actionCount: fc.integer({ min: 1, max: 4 }),
  tree: fc.array(fc.tuple(fc.nat(50), fc.nat(50)), { minLength: 7, maxLength: 7 }),
  extra: fc.array(fc.tuple(fc.nat(50), fc.nat(50), fc.nat(50)), { maxLength: 6 }),
  terminals: fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }),
  hasDefects: fc.boolean(),
  ghostTo: fc.integer({ min: 0, max: 2 }),
  ghostFrom: fc.integer({ min: 0, max: 2 }),
  ghostAction: fc.integer({ min: 0, max: 2 }),
  orphans: fc.integer({ min: 0, max: 2 }),
  unmapped: fc.uniqueArray(fc.nat(6), { maxLength: 3 }),
  broken: fc.array(fc.constantFrom(...BREAKS), { maxLength: 2 }),
});

type Pair = `${ViolationCategory}|${string}`;

function build(plan: Plan): {
  definition: ScenarioDefinition;
  rubric: { terminalStates: Record<string, unknown> };
  expected: Set<Pair>;
} {
  const d = structuredClone(fixture.definition) as ScenarioDefinition;
  d.states = {};
  d.actions = {};
  d.transitions = [];
  const sid = (i: number): string => `st-${i}`;
  const aid = (i: number): string => `act-${i}`;
  const n = plan.stateCount;
  for (let i = 0; i < n; i += 1) {
    d.states[sid(i)] = {
      ...structuredClone(stateTemplate),
      id: sid(i),
      is_terminal: plan.terminals[i]!,
    };
  }
  for (let i = 0; i < plan.actionCount; i += 1) {
    d.actions[aid(i)] = { ...structuredClone(actionTemplate), id: aid(i) };
  }
  d.initial_state_id = sid(0);
  const trig = (sel: number): string =>
    sel % (plan.actionCount + 1) === plan.actionCount
      ? "time_elapsed"
      : aid(sel % (plan.actionCount + 1));
  const edge = (from: string, trigger: string, to: string): void => {
    d.transitions.push({
      from_state_id: from,
      trigger,
      guard: null,
      to_state_id: to,
      effects: [],
      delayed_effects: [],
    });
  };
  // spanning tree keeps everything reachable from the initial state
  for (let i = 1; i < n; i += 1) {
    const [p, t] = plan.tree[i]!;
    edge(sid(p % i), trig(t), sid(i));
  }
  for (const [f, t, to] of plan.extra) edge(sid(f % n), trig(t), sid(to % n));

  const expected = new Set<Pair>();
  const rubricTerminals = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [id, s] of Object.entries(d.states)) if (s.is_terminal) out[id] = { debrief: id };
    return out;
  };

  if (plan.hasDefects) {
    for (let k = 0; k < plan.ghostTo; k += 1) {
      edge(sid(0), trig(k), `ghost-to-${k}`);
      expected.add(`invalid-reference|ghost-to-${k}`);
    }
    for (let k = 0; k < plan.ghostFrom; k += 1) {
      edge(`ghost-from-${k}`, trig(k), sid(0));
      expected.add(`invalid-reference|ghost-from-${k}`);
    }
    for (let k = 0; k < plan.ghostAction; k += 1) {
      edge(sid(0), `ghost-action-${k}`, sid(0));
      expected.add(`invalid-reference|ghost-action-${k}`);
    }
    for (let k = 0; k < plan.orphans; k += 1) {
      d.states[`orphan-${k}`] = {
        ...structuredClone(stateTemplate),
        id: `orphan-${k}`,
        is_terminal: false,
      };
      edge(`orphan-${k}`, "time_elapsed", sid(0)); // outgoing only: still unreachable
      expected.add(`unreachable-state|orphan-${k}`);
    }
    plan.broken.forEach((mode, k) => {
      const id = `broken-${k}`;
      const a = { ...structuredClone(actionTemplate), id } as unknown as Record<string, unknown>;
      if (mode === "no-rationale") a["rationale_options"] = [];
      if (mode === "negative-time") a["time_cost"] = -1;
      if (mode === "no-effects") a["effects"] = undefined;
      if (mode === "no-preconditions") a["preconditions"] = undefined;
      d.actions[id] = a as unknown as ScenarioDefinition["actions"][string];
      edge(sid(0), id, sid(0));
      expected.add(`incomplete-action|${id}`);
    });
  }
  const terminals = rubricTerminals();
  if (plan.hasDefects) {
    for (const idx of plan.unmapped) {
      const id = sid(idx % n);
      d.states[id]!.is_terminal = true;
      delete terminals[id];
      expected.add(`missing-debrief|${id}`);
    }
  }
  return { definition: d, rubric: { terminalStates: terminals }, expected };
}

/** Independent oracle: plain BFS over the transition list. */
function oracleUnreachable(d: ScenarioDefinition): string[] {
  const seen = new Set<string>([d.initial_state_id]);
  const queue = [d.initial_state_id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const t of d.transitions) {
      if (t.from_state_id === cur && t.to_state_id in d.states && !seen.has(t.to_state_id)) {
        seen.add(t.to_state_id);
        queue.push(t.to_state_id);
      }
    }
  }
  return Object.keys(d.states).filter((id) => !seen.has(id));
}

describe("Property 11: Scenario Validation Graph Completeness", () => {
  it(
    "valid iff no defect injected; every injected defect reported with category and id; deterministic order",
    { timeout: 60000 },
    () => {
      let validRuns = 0;
      let invalidRuns = 0;
      const seenCategories = new Set<ViolationCategory>();

      fc.assert(
        fc.property(planArb, (plan) => {
          const { definition, rubric, expected } = build(plan);
          const before = JSON.stringify(definition);
          const result = validateScenarioDefinition(definition, rubric as never);

          // pure + deterministic
          expect(JSON.stringify(definition)).toBe(before);
          expect(validateScenarioDefinition(definition, rubric as never)).toEqual(result);

          const actual = new Set<Pair>(
            result.violations.map((v): Pair => `${v.category}|${v.stateOrActionId}`),
          );
          expect(actual).toEqual(expected);

          // independent reachability oracle
          const unreachable = new Set<string>(oracleUnreachable(definition));
          const reported = new Set<string>(
            result.violations
              .filter((v) => v.category === "unreachable-state")
              .map((v) => v.stateOrActionId),
          );
          expect(reported).toEqual(unreachable);

          // validity iff no defect injected
          expect(result.valid).toBe(expected.size === 0);
          expect(result.violations.length === 0).toBe(expected.size === 0);

          // sorted by category then id
          const keys = result.violations.map((v) => [v.category, v.stateOrActionId] as const);
          for (let i = 1; i < keys.length; i += 1) {
            const [c0, i0] = keys[i - 1]!;
            const [c1, i1] = keys[i]!;
            expect(c0 < c1 || (c0 === c1 && i0 <= i1)).toBe(true);
          }

          if (result.valid) validRuns += 1;
          else invalidRuns += 1;
          for (const v of result.violations) seenCategories.add(v.category);
        }),
        { numRuns: 200 },
      );

      expect(validRuns).toBeGreaterThan(0);
      expect(invalidRuns).toBeGreaterThan(0);
      for (const c of CATEGORIES) expect(seenCategories.has(c)).toBe(true);
    },
  );
});
