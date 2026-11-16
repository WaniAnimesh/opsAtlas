/**
 * Scenario Validator module public API (Design D10).
 *
 * Pure graph validation of scenario definitions, used by CI content scripts.
 */

export { validateScenarioDefinition } from "./validator.js";
export type {
  ValidateOptions,
  ValidationResult,
  Violation,
  ViolationCategory,
} from "./validator.js";
