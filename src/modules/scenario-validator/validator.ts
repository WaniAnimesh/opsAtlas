/**
 * Scenario validator (pure, no I/O). Used by CI content scripts; not part of
 * any runtime request path.
 *
 * Checks: (a) invalid references, (b) unreachable states, (c) missing debrief
 * mappings for terminal states, (d) incomplete actions referenced by transitions.
 * All violations are collected; output ordering is deterministic.
 *
 * References: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8
 */

import type { ScenarioDefinition } from "../../types/index.js";
import type { RubricDefinition } from "../scoring-debrief/index.js";

export type ViolationCategory =
  "invalid-reference" | "unreachable-state" | "missing-debrief" | "incomplete-action";

export interface Violation {
  stateOrActionId: string;
  category: ViolationCategory;
  description: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: Violation[];
}

export interface ValidateOptions {
  /** Trigger value that denotes passage of time rather than an action. */
  timeTrigger?: string;
}

const has = (o: object | undefined | null, k: string): boolean =>
  o != null && Object.prototype.hasOwnProperty.call(o, k);

/** Validate a scenario definition against its rubric. Never stops at the first violation. */
export function validateScenarioDefinition(
  definition: ScenarioDefinition,
  rubric: Pick<RubricDefinition, "terminalStates">,
  options: ValidateOptions = {},
): ValidationResult {
  const timeTrigger = options.timeTrigger ?? "time_elapsed";
  const states = definition.states ?? {};
  const actions = definition.actions ?? {};
  const transitions = definition.transitions ?? [];
  const violations: Violation[] = [];
  const seen = new Set<string>();
  const add = (stateOrActionId: string, category: ViolationCategory, description: string): void => {
    const key = `${category}\u0000${stateOrActionId}\u0000${description}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ stateOrActionId, category, description });
  };

  // (a) references
  if (!has(states, definition.initial_state_id)) {
    add(
      String(definition.initial_state_id),
      "invalid-reference",
      `Initial state "${definition.initial_state_id}" does not exist in the state graph.`,
    );
  }
  const referencedActions = new Set<string>();
  transitions.forEach((t, i) => {
    const label = `Transition #${i}`;
    if (!has(states, t.from_state_id)) {
      add(
        String(t.from_state_id),
        "invalid-reference",
        `${label} references from_state_id "${t.from_state_id}" which does not exist.`,
      );
    }
    if (!has(states, t.to_state_id)) {
      add(
        String(t.to_state_id),
        "invalid-reference",
        `${label} references to_state_id "${t.to_state_id}" which does not exist.`,
      );
    }
    if (t.trigger !== timeTrigger) {
      if (has(actions, t.trigger)) {
        referencedActions.add(t.trigger);
      } else {
        add(
          String(t.trigger),
          "invalid-reference",
          `${label} trigger references action "${t.trigger}" which is not defined.`,
        );
      }
    }
  });

  // (b) reachability (iterative BFS, cycle-safe)
  const adjacency = new Map<string, string[]>();
  for (const t of transitions) {
    const list = adjacency.get(t.from_state_id) ?? [];
    list.push(t.to_state_id);
    adjacency.set(t.from_state_id, list);
  }
  const reachable = new Set<string>();
  if (has(states, definition.initial_state_id)) {
    const queue = [definition.initial_state_id];
    reachable.add(definition.initial_state_id);
    for (let head = 0; head < queue.length; head += 1) {
      for (const next of adjacency.get(queue[head] as string) ?? []) {
        if (has(states, next) && !reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
  }
  for (const id of Object.keys(states)) {
    if (!reachable.has(id)) {
      add(
        id,
        "unreachable-state",
        `State "${id}" is not reachable from initial state "${definition.initial_state_id}".`,
      );
    }
  }

  // (c) terminal debrief mappings
  for (const [id, state] of Object.entries(states)) {
    if (state.is_terminal && !has(rubric.terminalStates, id)) {
      add(id, "missing-debrief", `Terminal state "${id}" has no debrief mapping in the rubric.`);
    }
  }

  // (d) action completeness
  for (const id of referencedActions) {
    const a = actions[id];
    if (a === undefined) continue;
    const missing: string[] = [];
    if (!Array.isArray(a.preconditions)) missing.push("preconditions");
    if (typeof a.time_cost !== "number" || !Number.isFinite(a.time_cost) || a.time_cost < 0) {
      missing.push("time_cost (non-negative number)");
    }
    if (!Array.isArray(a.effects)) missing.push("effects");
    if (!Array.isArray(a.rationale_options) || a.rationale_options.length < 1) {
      missing.push("at least one rationale option");
    }
    if (missing.length > 0) {
      add(id, "incomplete-action", `Action "${id}" is missing: ${missing.join(", ")}.`);
    }
  }

  violations.sort(
    (x, y) =>
      cmp(x.category, y.category) ||
      cmp(x.stateOrActionId, y.stateOrActionId) ||
      cmp(x.description, y.description),
  );
  return { valid: violations.length === 0, violations };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
