/**
 * Decision Atlas content model. Shared by the build-time loader, the integrity
 * validator (also run by scripts/validate-content.ts), search and the graph.
 * Keep this file free of Node and React imports.
 */

export const ENTITY_TYPES = [
  "concept",
  "decision",
  "comparison",
  "technology",
  "pattern",
  "failure-pattern",
  "framework",
  "case-study",
  "review",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const RELATION_TYPES = [
  // Decision relationships
  "requires",
  "enables",
  "depends-on",
  "alternative-to",
  "precedes",
  "influences",
  "evaluates",
  // Technology relationships
  "implements",
  "provides",
  "integrates-with",
  "competes-with",
  "replaces",
  // Operational relationships
  "introduces-risk",
  "mitigates",
  "improves",
  "degrades",
  "requires-capability",
  // Failure relationships
  "can-cause",
  "contributes-to",
  "amplifies",
  "prevents",
  "recovers-from",
  // Learning relationships
  "prerequisite-for",
  "related-to",
  "deepens",
  "example-of",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export type RelationFamily = "decision" | "technology" | "operational" | "failure" | "learning";

/** PRD 11.1 standard evaluation dimensions. */
export const DIMENSIONS = [
  "Cost",
  "Performance",
  "Reliability",
  "Scalability",
  "Complexity",
  "Security",
  "Operations",
  "Developer Experience",
  "Organizational Fit",
  "Flexibility",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** PRD 12.2 content depth levels. */
export type Difficulty = "orientation" | "decision" | "operational";
export type PublicationStatus = "published" | "draft";

/** A paragraph (string) or a bullet list (string[]). */
export type Text = string | string[];

export const SECTION_KEYS = [
  "overview",
  "context",
  "assumptions",
  "challenge",
  "constraints",
  "facts",
  "causes",
  "progression",
  "warningSigns",
  "whenToUse",
  "whenNotToUse",
  "alternatives",
  "operations",
  "cost",
  "organization",
  "technicalImpact",
  "businessImpact",
  "organizationalImpact",
  "failureModes",
  "prevention",
  "recovery",
  "reasoning",
  "application",
  "examples",
  "limitations",
  "interpretation",
  "implementation",
  "lessons",
  "summary",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export interface Source {
  title: string;
  url: string;
  publisher?: string;
}

export interface Relation {
  type: RelationType;
  target: string;
  /** Why the connection matters. Shown on pages and in journeys. */
  note?: string;
}

export interface TradeoffRow {
  dimension: Dimension;
  /** One value per option, same order as TradeoffMatrix.options. */
  values: string[];
}

export interface TradeoffMatrix {
  options: string[];
  rows: TradeoffRow[];
}

export interface OptionGuidance {
  option: string;
  chooseWhen: string[];
  avoidWhen?: string[];
}

/** Architecture review criterion (Layer 16). */
export interface ReviewCriterion {
  area: string;
  question: string;
  healthy: string;
  risk: string;
  /** Entity ids to read when the risk signal is present. */
  explore?: string[];
}

export interface AtlasEntity {
  id: string;
  title: string;
  type: EntityType;
  layer: string;
  subcategory?: string;
  secondaryLayers?: string[];
  description: string;
  /** The decision question, e.g. "Should we split the monolith?" */
  question?: string;
  tags: string[];
  aliases?: string[];
  /** Problem phrasings users type before they know the terminology. */
  problems?: string[];
  difficulty: Difficulty;
  status: PublicationStatus;
  lastReviewed: string;
  sources?: Source[];
  sections: Partial<Record<SectionKey, Text>>;
  tradeoffs?: TradeoffMatrix;
  guidance?: OptionGuidance[];
  criteria?: ReviewCriterion[];
  /** OpsAtlas incident slugs that illustrate this entity. */
  incidents?: string[];
  relations: Relation[];
}

export interface LayerTopic {
  title: string;
  /** Entity id when the topic has a page; omitted for planned topics. */
  entity?: string;
}

export interface Subcategory {
  id: string;
  title: string;
  topics: LayerTopic[];
}

export interface Layer {
  id: string;
  number: number;
  title: string;
  purpose: string;
  whyItMatters: string;
  priority?: string;
  subcategories: Subcategory[];
}

export interface JourneyStep {
  entity: string;
  /** Why this step follows the previous one. */
  why: string;
}

export interface Journey {
  id: string;
  title: string;
  summary: string;
  steps: JourneyStep[];
}

export interface AtlasContent {
  layers: Layer[];
  entities: AtlasEntity[];
  journeys: Journey[];
}
