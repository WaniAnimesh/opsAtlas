import { actionPreconditionFailed, type ApiErrorResponse } from "../../api/errors.js";
import type {
  Condition,
  DelayedEffect,
  ScenarioAction,
  ScenarioDefinition,
  ScenarioState,
  ScenarioTransition,
  StateEffect,
} from "../../types/index.js";

/**
 * The effects that remain to be applied after simulated time advances.
 *
 * DelayedEffect is intentionally used as the public pending-event shape. It
 * preserves the scenario JSON contract and lets the session layer attach its
 * own event sequence and execution time when it persists the event.
 */
export type PendingEvent = DelayedEffect;

/** The deterministic result of resolving one evidence request. */
export interface EvidenceResolution {
  status: "available" | "unavailable";
  payload?: unknown;
}

/**
 * Resolves evidence using only the current state and pinned scenario data.
 * An evidence item must be both defined and listed as available by the state.
 */
export function resolveEvidence(
  state: ScenarioState,
  evidenceId: string,
  definition: ScenarioDefinition,
): EvidenceResolution {
  const evidence = definition.evidence[evidenceId];
  const isDefined = Object.prototype.hasOwnProperty.call(definition.evidence, evidenceId);
  const isAvailable = state.evidence_available.includes(evidenceId);

  if (!isDefined || !isAvailable || evidence === undefined) {
    return { status: "unavailable" };
  }

  return { status: "available", payload: cloneValue(evidence.payload) };
}

/** Returns human-readable text for each unmet precondition (empty when all are met). */
export function listUnmetPreconditions(state: ScenarioState, action: ScenarioAction): string[] {
  return action.preconditions
    .filter((condition) => !evaluateCondition(state, condition))
    .map(formatCondition);
}

/** The successful, entirely in-memory result of one action application. */
export interface TransitionSuccess {
  nextState: ScenarioState;
  sideEffects: StateEffect[];
  pendingEvents: PendingEvent[];
  simTimeDelta: number;
}

/** A structured failure using the repository's API error convention. */
export interface TransitionFailure {
  error: ApiErrorResponse;
}

export type TransitionResult = TransitionSuccess | TransitionFailure;

/**
 * Applies one action to a scenario state without performing I/O or mutating
 * any input. The scenario definition controls the target state and transition
 * ordering; action effects are applied before transition effects so a
 * transition can deliberately override an action-level value.
 */
export function applyTransition(
  state: ScenarioState,
  action: ScenarioAction,
  definition: ScenarioDefinition,
): TransitionResult {
  const unmetPreconditions = action.preconditions.filter(
    (condition) => !evaluateCondition(state, condition),
  );

  if (unmetPreconditions.length > 0) {
    const detail = unmetPreconditions.map(formatCondition).join("; ");
    return { error: actionPreconditionFailed(detail) };
  }

  const transition = findApplicableTransition(state, action, definition);
  const nextState = cloneState(
    transition === undefined
      ? state
      : (definition.states[transition.to_state_id] ?? {
          ...state,
          id: transition.to_state_id,
        }),
  );

  // Keep this ordering stable. Effects from the action happen first, its
  // side-effects second, and effects owned by the selected transition last.
  for (const effect of action.effects) {
    applyEffect(nextState, effect);
  }
  for (const effect of action.side_effects) {
    applyEffect(nextState, effect);
  }
  for (const effect of transition?.effects ?? []) {
    applyEffect(nextState, effect);
  }

  return {
    nextState,
    sideEffects: action.side_effects.map(cloneValue),
    pendingEvents: [
      ...action.delayed_effects.map(cloneValue),
      ...(transition?.delayed_effects ?? []).map(cloneValue),
    ],
    simTimeDelta: action.time_cost,
  };
}

function findApplicableTransition(
  state: ScenarioState,
  action: ScenarioAction,
  definition: ScenarioDefinition,
): ScenarioTransition | undefined {
  return definition.transitions.find(
    (transition) =>
      transition.from_state_id === state.id &&
      transition.trigger === action.id &&
      (transition.guard === null || evaluateCondition(state, transition.guard)),
  );
}

function evaluateCondition(state: ScenarioState, condition: Condition): boolean {
  const actual = readField(state, condition.field);
  const operator = condition.operator.toLowerCase();

  switch (operator) {
    case "eq":
    case "equal":
    case "equals":
    case "===":
      return valuesEqual(actual, condition.value);
    case "neq":
    case "not_eq":
    case "not_equal":
    case "not_equals":
    case "!==":
      return !valuesEqual(actual, condition.value);
    case "gt":
    case "greater_than":
      return compareValues(actual, condition.value, (left, right) => left > right);
    case "gte":
    case "greater_than_or_equal":
    case "ge":
      return compareValues(actual, condition.value, (left, right) => left >= right);
    case "lt":
    case "less_than":
      return compareValues(actual, condition.value, (left, right) => left < right);
    case "lte":
    case "less_than_or_equal":
    case "le":
      return compareValues(actual, condition.value, (left, right) => left <= right);
    case "in":
      return (
        Array.isArray(condition.value) && condition.value.some((item) => valuesEqual(actual, item))
      );
    case "not_in":
      return (
        Array.isArray(condition.value) && !condition.value.some((item) => valuesEqual(actual, item))
      );
    case "contains":
      return containsValue(actual, condition.value);
    case "not_contains":
      return !containsValue(actual, condition.value);
    case "exists":
      return actual !== undefined;
    case "not_exists":
      return actual === undefined;
    default:
      return false;
  }
}

function readField(state: ScenarioState, field: string): unknown {
  if (field.length === 0) {
    return undefined;
  }

  let current: unknown = state;
  for (const segment of field.split(".")) {
    if (!isRecord(current) && !Array.isArray(current)) {
      return undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = Array.isArray(current)
      ? current[Number(segment)]
      : (current as Record<string, unknown>)[segment];
  }
  return current;
}

function applyEffect(state: ScenarioState, effect: StateEffect): void {
  const segments = effect.field.split(".");
  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    return;
  }

  let target = state as unknown as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    const existing = target[segment];
    if (isRecord(existing)) {
      target = existing;
    } else {
      const nested: Record<string, unknown> = {};
      target[segment] = nested;
      target = nested;
    }
  }

  const finalSegment = segments[segments.length - 1];
  if (finalSegment !== undefined) {
    target[finalSegment] = cloneValue(effect.value);
  }
}

function compareValues(
  actual: unknown,
  expected: unknown,
  comparator: (left: number, right: number) => boolean,
): boolean {
  return typeof actual === "number" && typeof expected === "number" && comparator(actual, expected);
}

function containsValue(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.includes(expected);
  }
  return Array.isArray(actual) && actual.some((item) => valuesEqual(item, expected));
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((item, index) => valuesEqual(item, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(right, key) && valuesEqual(left[key], right[key]),
      )
    );
  }
  return false;
}

function formatCondition(condition: Condition): string {
  let value: string;
  try {
    value = JSON.stringify(condition.value) ?? String(condition.value);
  } catch {
    value = String(condition.value);
  }
  return `${condition.field} ${condition.operator} ${value}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneState(state: ScenarioState): ScenarioState {
  return cloneValue(state);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
