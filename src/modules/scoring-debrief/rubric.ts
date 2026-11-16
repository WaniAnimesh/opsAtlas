/**
 * Rubric definition type and guard. Runtime-neutral and free of runtime
 * imports so build scripts and the Worker bundle can share it.
 */

/** Debrief text and recovery credit for a terminal scenario state. */
export interface TerminalStateMapping {
  outcome: string;
  /** Fraction (0..1) of the max score granted to Recovery Quality. */
  recoveryFraction: number;
  debrief: string;
}

/**
 * A versioned, JSON-serialisable rubric (`content/rubrics/{version}.json`).
 * Criteria parameters are consumed by the scoring functions; all dimension
 * scores are on the 0..maxScore scale.
 */
export interface RubricDefinition {
  version: string;
  maxScore: number;
  criteria: {
    impactControl: { description: string };
    diagnosticQuality: {
      description: string;
      /** Available evidence requests expected before a mitigating action. */
      minEvidenceBeforeMitigation: number;
    };
    riskManagement: { description: string };
    recoveryQuality: {
      description: string;
      /** Fraction used when the session ends in a terminal state with no mapping. */
      unmappedTerminalFraction: number;
    };
    communication: {
      description: string;
      /** Lower-case substrings matched against action id and label. */
      actionKeywords: string[];
    };
    learningReflection: { description: string };
  };
  /** Terminal state id -> debrief mapping. */
  terminalStates: Record<string, TerminalStateMapping>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasDescription(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value["description"] === "string";
}

function isTerminalMapping(value: unknown): value is TerminalStateMapping {
  return (
    isRecord(value) &&
    typeof value["outcome"] === "string" &&
    typeof value["recoveryFraction"] === "number" &&
    typeof value["debrief"] === "string"
  );
}

/** Structural guard for a rubric file. */
export function isRubricDefinition(value: unknown): value is RubricDefinition {
  if (!isRecord(value)) return false;
  const criteria = value["criteria"];
  const terminalStates = value["terminalStates"];
  if (!isRecord(criteria) || !isRecord(terminalStates)) return false;
  const diagnostic = criteria["diagnosticQuality"];
  const recovery = criteria["recoveryQuality"];
  const communication = criteria["communication"];
  return (
    typeof value["version"] === "string" &&
    value["version"].length > 0 &&
    typeof value["maxScore"] === "number" &&
    value["maxScore"] > 0 &&
    hasDescription(criteria["impactControl"]) &&
    hasDescription(diagnostic) &&
    typeof diagnostic["minEvidenceBeforeMitigation"] === "number" &&
    hasDescription(criteria["riskManagement"]) &&
    hasDescription(recovery) &&
    typeof recovery["unmappedTerminalFraction"] === "number" &&
    hasDescription(communication) &&
    Array.isArray(communication["actionKeywords"]) &&
    communication["actionKeywords"].every((k) => typeof k === "string") &&
    hasDescription(criteria["learningReflection"]) &&
    Object.values(terminalStates).every(isTerminalMapping)
  );
}
