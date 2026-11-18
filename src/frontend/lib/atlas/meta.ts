/** Display metadata for entity types and relation types. Pure; no Node imports. */
import type { AtlasEntity, EntityType, RelationFamily, RelationType, SectionKey } from "./types";

export interface TypeMeta {
  label: string;
  plural: string;
  /** URL segment: /<section>/<id>/ */
  section: string;
  blurb: string;
}

export const TYPE_META: Record<EntityType, TypeMeta> = {
  decision: {
    label: "Architecture Decision",
    plural: "Architecture Decisions",
    section: "decisions",
    blurb: "Questions engineers have to answer, with alternatives, tradeoffs and consequences.",
  },
  comparison: {
    label: "Comparison",
    plural: "Comparisons",
    section: "comparisons",
    blurb: "Side-by-side evaluations of technologies or approaches against shared criteria.",
  },
  technology: {
    label: "Technology",
    plural: "Technologies",
    section: "technologies",
    blurb: "Tools and services, described by the role they play in an architecture.",
  },
  pattern: {
    label: "Architecture Pattern",
    plural: "Architecture Patterns",
    section: "patterns",
    blurb: "Reusable structures and their operational consequences.",
  },
  concept: {
    label: "Foundational Concept",
    plural: "Foundational Concepts",
    section: "concepts",
    blurb: "Mental models that decisions build on.",
  },
  "failure-pattern": {
    label: "Failure Pattern",
    plural: "Failure Patterns",
    section: "failure-patterns",
    blurb: "How architectures fail, how to spot it early, and which decisions cause it.",
  },
  framework: {
    label: "Decision Framework",
    plural: "Decision Frameworks",
    section: "frameworks",
    blurb: "Reasoning tools for evaluating architecture choices.",
  },
  "case-study": {
    label: "Case Study",
    plural: "Case Studies",
    section: "case-studies",
    blurb: "Public real-world systems, with documented facts separated from analysis.",
  },
  review: {
    label: "Architecture Review",
    plural: "Architecture Reviews",
    section: "reviews",
    blurb: "Structured assessments for startups, growth companies and enterprises.",
  },
};

export const TYPE_ORDER: EntityType[] = [
  "decision",
  "comparison",
  "technology",
  "pattern",
  "concept",
  "failure-pattern",
  "framework",
  "case-study",
  "review",
];

/** Fill colours for graph nodes; each passes 3:1 against white for UI contrast. */
export const TYPE_COLOR: Record<EntityType, string> = {
  decision: "#0550ae",
  comparison: "#0a6d8f",
  technology: "#1a7f37",
  pattern: "#8a5a00",
  concept: "#6639ba",
  "failure-pattern": "#b42318",
  framework: "#a0307a",
  "case-study": "#57606a",
  review: "#b0480a",
};

export function sectionToType(section: string): EntityType | null {
  const found = TYPE_ORDER.find((t) => TYPE_META[t].section === section);
  return found ?? null;
}

export function entityHref(e: Pick<AtlasEntity, "id" | "type">): string {
  return `/${TYPE_META[e.type].section}/${e.id}/`;
}

export function layerHref(layerId: string): string {
  return `/layers/${layerId}/`;
}

export function journeyHref(id: string): string {
  return `/journeys/${id}/`;
}

export interface RelationMeta {
  family: RelationFamily;
  /** Label read as "<source> <label> <target>". */
  label: string;
  /** Label read as "<target> <inverse> <source>", used for incoming edges. */
  inverse: string;
}

export const RELATION_META: Record<RelationType, RelationMeta> = {
  requires: { family: "decision", label: "Requires", inverse: "Required by" },
  enables: { family: "decision", label: "Enables", inverse: "Enabled by" },
  "depends-on": { family: "decision", label: "Depends on", inverse: "Dependency of" },
  "alternative-to": { family: "decision", label: "Alternative to", inverse: "Alternative to" },
  precedes: { family: "decision", label: "Leads to", inverse: "Follows from" },
  influences: { family: "decision", label: "Influences", inverse: "Influenced by" },
  evaluates: { family: "decision", label: "Evaluates", inverse: "Evaluated in" },
  implements: { family: "technology", label: "Implements", inverse: "Implemented by" },
  provides: { family: "technology", label: "Provides", inverse: "Provided by" },
  "integrates-with": { family: "technology", label: "Integrates with", inverse: "Integrates with" },
  "competes-with": { family: "technology", label: "Competes with", inverse: "Competes with" },
  replaces: { family: "technology", label: "Replaces", inverse: "Replaced by" },
  "introduces-risk": { family: "operational", label: "Introduces risk of", inverse: "Risk introduced by" },
  mitigates: { family: "operational", label: "Mitigates", inverse: "Mitigated by" },
  improves: { family: "operational", label: "Improves", inverse: "Improved by" },
  degrades: { family: "operational", label: "Degrades", inverse: "Degraded by" },
  "requires-capability": {
    family: "operational",
    label: "Requires capability in",
    inverse: "Capability needed by",
  },
  "can-cause": { family: "failure", label: "Can cause", inverse: "Can be caused by" },
  "contributes-to": { family: "failure", label: "Contributes to", inverse: "Contributed to by" },
  amplifies: { family: "failure", label: "Amplifies", inverse: "Amplified by" },
  prevents: { family: "failure", label: "Prevents", inverse: "Prevented by" },
  "recovers-from": { family: "failure", label: "Recovers from", inverse: "Recovered from by" },
  "prerequisite-for": { family: "learning", label: "Prerequisite for", inverse: "Builds on" },
  "related-to": { family: "learning", label: "Related to", inverse: "Related to" },
  deepens: { family: "learning", label: "Deepens understanding of", inverse: "Deepened by" },
  "example-of": { family: "learning", label: "Example of", inverse: "Illustrated by" },
};

export const FAMILY_LABEL: Record<RelationFamily, string> = {
  decision: "Decision",
  technology: "Technology",
  operational: "Operational",
  failure: "Failure",
  learning: "Learning",
};

/** Outgoing relation types that point at a sensible next step. */
export const NEXT_STEP_TYPES: ReadonlySet<RelationType> = new Set<RelationType>([
  "precedes",
  "requires",
  "enables",
  "depends-on",
  "requires-capability",
  "prerequisite-for",
  "deepens",
]);

const DEFAULT_HEADINGS: Record<SectionKey, string> = {
  overview: "Overview",
  context: "Architectural context",
  assumptions: "Assumptions",
  challenge: "Architectural challenge",
  constraints: "Constraints",
  facts: "Publicly documented facts",
  causes: "Why it occurs",
  progression: "How it develops",
  warningSigns: "Early warning signs",
  whenToUse: "When to use",
  whenNotToUse: "When not to use",
  alternatives: "Alternatives",
  operations: "Operational consequences",
  cost: "Cost implications",
  organization: "Organizational implications",
  technicalImpact: "Technical consequences",
  businessImpact: "Business consequences",
  organizationalImpact: "Organizational consequences",
  failureModes: "Failure modes",
  prevention: "Prevention strategies",
  recovery: "Recovery strategies",
  reasoning: "Underlying reasoning",
  application: "Applying it to architecture decisions",
  examples: "Practical examples",
  limitations: "Limitations",
  interpretation: "Atlas analysis (interpretation, not documented fact)",
  implementation: "Implementation considerations",
  lessons: "Transferable lessons",
  summary: "Decision summary",
};

const TYPE_HEADINGS: Partial<Record<EntityType, Partial<Record<SectionKey, string>>>> = {
  decision: { context: "Problem context", whenToUse: "Decision criteria" },
  comparison: { whenToUse: "Where each option fits", whenNotToUse: "Where each option struggles" },
  technology: { context: "Architectural role", whenToUse: "Problems it solves", whenNotToUse: "Limitations" },
  "failure-pattern": { overview: "What the failure is" },
  framework: { overview: "Purpose", whenToUse: "When to use it", whenNotToUse: "When not to use it" },
  "case-study": { context: "Company and system context" },
  review: { context: "Who this review is for", summary: "How to use the results" },
};

export function sectionHeading(type: EntityType, key: SectionKey): string {
  return TYPE_HEADINGS[type]?.[key] ?? DEFAULT_HEADINGS[key];
}

export const DIFFICULTY_LABEL: Record<string, string> = {
  orientation: "Level 1 · Orientation",
  decision: "Level 2 · Decision",
  operational: "Level 3 · Operational",
};
