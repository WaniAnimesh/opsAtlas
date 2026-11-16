// Shared TypeScript types for OpsAtlas

/**
 * Wire shape for all API error responses.
 * Every error response body conforms to `{ error: { code, message, details? } }`.
 */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ScenarioDifficulty = "beginner" | "intermediate" | "advanced";

export interface Condition {
  field: string;
  operator: string;
  value: unknown;
}

export interface StateEffect {
  field: string;
  value: unknown;
}

export interface DelayedEffect {
  delay: number;
  effect: StateEffect;
}

export interface ScenarioState {
  id: string;
  is_terminal: boolean;
  service_health: Record<string, string>;
  metrics: Record<string, number>;
  dependencies: Record<string, string>;
  customer_impact: string;
  evidence_available: string[];
  active_alerts: string[];
}

export interface ScenarioAction {
  id: string;
  label: string;
  preconditions: Condition[];
  time_cost: number;
  effects: StateEffect[];
  side_effects: StateEffect[];
  delayed_effects: DelayedEffect[];
  reversible: boolean;
  rationale_options: string[];
}

export interface ScenarioTransition {
  from_state_id: string;
  trigger: string;
  guard: Condition | null;
  to_state_id: string;
  effects: StateEffect[];
  delayed_effects: DelayedEffect[];
}

export interface EvidenceItem {
  id: string;
  category: "Observable" | "Indicator" | "Artifact";
  type: "logs" | "metrics" | "topology" | "change_history";
  time_cost: number;
  payload: unknown;
}

export interface ScenarioDefinition {
  initial_state_id: string;
  states: Record<string, ScenarioState>;
  actions: Record<string, ScenarioAction>;
  transitions: ScenarioTransition[];
  evidence: Record<string, EvidenceItem>;
}

export interface ScenarioContentFile {
  id: string;
  incident_slug: string;
  title: string;
  objective: string;
  difficulty: ScenarioDifficulty;
  est_duration_min: number;
  time_limit_min?: number;
  rubric_version: string;
  skill_tags: string[];
  version: string;
  definition: ScenarioDefinition;
}

export interface IncidentSource {
  publisher: string;
  url?: string;
  bibliographic_ref?: string;
  published_at?: string;
  source_tier: "tier1" | "tier2" | "tier3";
}

export interface TimelineEvent {
  occurred_at: string;
  tz_offset: string;
  description: string;
  confidence: "fact" | "inference" | "teaching_simplification" | "unknown";
  source_ref?: string;
  sequence_pos: number;
}

export interface CausalFactor {
  factor_type: string;
  description: string;
  confidence: "fact" | "inference" | "teaching_simplification" | "unknown";
  source_ref?: string;
}

export interface Lesson {
  category: string;
  statement: string;
  recommended_control?: string;
  source_ref?: string;
}

export interface IncidentContentFile {
  slug: string;
  title: string;
  org: string;
  incident_date: string;
  summary: string;
  impact: string;
  failure_domain: string;
  severity: string;
  is_reconstruction: boolean;
  skill_tags: string[];
  sources: IncidentSource[];
  timeline: TimelineEvent[];
  causal_factors: CausalFactor[];
  lessons: Lesson[];
  /** Optional metadata supported by catalog filters when supplied by content. */
  technology?: string | string[];
}
