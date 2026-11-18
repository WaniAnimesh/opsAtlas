/**
 * Referential-integrity and content-contract checks for the Decision Atlas.
 * Used by the build-time loader (build fails on errors) and by
 * scripts/validate-content.ts. Pure: no Node or React imports.
 */
import {
  DIMENSIONS,
  ENTITY_TYPES,
  RELATION_TYPES,
  SECTION_KEYS,
  type AtlasContent,
  type AtlasEntity,
} from "./types";

export const ATLAS_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function hasSection(e: AtlasEntity, key: (typeof SECTION_KEYS)[number]): boolean {
  const v = e.sections[key];
  return typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) && v.length > 0;
}

/** Returns human-readable errors; an empty array means the content is consistent. */
export function validateAtlas(content: AtlasContent, incidentSlugs?: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const layerIds = new Set<string>();
  const ids = new Set<string>();
  const types = new Set<string>(ENTITY_TYPES);
  const relTypes = new Set<string>(RELATION_TYPES);
  const dims = new Set<string>(DIMENSIONS);
  const sectionKeys = new Set<string>(SECTION_KEYS);

  for (const l of content.layers) {
    if (layerIds.has(l.id)) errors.push(`layer ${l.id}: duplicate id`);
    layerIds.add(l.id);
  }
  if (content.layers.length !== 19) errors.push(`expected 19 layers, found ${content.layers.length}`);

  for (const e of content.entities) {
    if (!ATLAS_ID_PATTERN.test(e.id)) errors.push(`entity ${e.id}: id must be a lowercase slug`);
    if (ids.has(e.id)) errors.push(`entity ${e.id}: duplicate id`);
    ids.add(e.id);
  }

  const degree = new Map<string, number>([...ids].map((id) => [id, 0]));
  const byId = new Map(content.entities.map((e) => [e.id, e]));

  for (const e of content.entities) {
    const at = `entity ${e.id}`;
    if (!types.has(e.type)) errors.push(`${at}: unknown type "${e.type}"`);
    if (!layerIds.has(e.layer)) errors.push(`${at}: unknown layer "${e.layer}"`);
    for (const l of e.secondaryLayers ?? []) {
      if (!layerIds.has(l)) errors.push(`${at}: unknown secondary layer "${l}"`);
    }
    if (!DATE_PATTERN.test(e.lastReviewed)) errors.push(`${at}: lastReviewed must be YYYY-MM-DD`);
    if (e.description.trim().length === 0) errors.push(`${at}: description is empty`);
    for (const k of Object.keys(e.sections)) {
      if (!sectionKeys.has(k)) errors.push(`${at}: unknown section "${k}"`);
    }
    if (!hasSection(e, "overview")) errors.push(`${at}: missing overview section`);

    const seenRel = new Set<string>();
    for (const r of e.relations) {
      if (!relTypes.has(r.type)) errors.push(`${at}: unknown relation type "${r.type}"`);
      if (r.target === e.id) errors.push(`${at}: relation to itself`);
      if (!ids.has(r.target)) errors.push(`${at}: relation ${r.type} -> missing entity "${r.target}"`);
      const key = `${r.type}:${r.target}`;
      if (seenRel.has(key)) errors.push(`${at}: duplicate relation ${key}`);
      seenRel.add(key);
      if (ids.has(r.target)) {
        degree.set(e.id, (degree.get(e.id) ?? 0) + 1);
        degree.set(r.target, (degree.get(r.target) ?? 0) + 1);
      }
    }

    if (e.tradeoffs) {
      const n = e.tradeoffs.options.length;
      if (n < 2) errors.push(`${at}: tradeoff matrix needs at least two options`);
      for (const row of e.tradeoffs.rows) {
        if (!dims.has(row.dimension)) errors.push(`${at}: unknown tradeoff dimension "${row.dimension}"`);
        if (row.values.length !== n) {
          errors.push(`${at}: tradeoff row "${row.dimension}" has ${row.values.length} values, expected ${n}`);
        }
      }
    }

    for (const slug of e.incidents ?? []) {
      if (incidentSlugs && !incidentSlugs.has(slug)) errors.push(`${at}: unknown incident "${slug}"`);
    }
    for (const c of e.criteria ?? []) {
      for (const x of c.explore ?? []) {
        if (!ids.has(x)) errors.push(`${at}: review criterion "${c.area}" links missing entity "${x}"`);
      }
    }
  }

  // Content contracts per type (FR-002, FR-004, PRD 6.15).
  const neighbours = (id: string): AtlasEntity[] => {
    const out = (byId.get(id)?.relations ?? []).map((r) => byId.get(r.target));
    const inc = content.entities.filter((x) => x.relations.some((r) => r.target === id));
    return [...out, ...inc].filter((x): x is AtlasEntity => x !== undefined);
  };
  for (const e of content.entities) {
    const at = `entity ${e.id}`;
    if (e.status === "published" && (degree.get(e.id) ?? 0) === 0) errors.push(`${at}: orphaned (no relations)`);
    if (e.type === "decision" || e.type === "comparison") {
      if (!e.question) errors.push(`${at}: decision/comparison needs a question`);
      if (!e.tradeoffs) errors.push(`${at}: decision/comparison needs a tradeoff matrix`);
      if (!hasSection(e, "whenToUse")) errors.push(`${at}: missing whenToUse`);
      if (!hasSection(e, "whenNotToUse")) errors.push(`${at}: missing whenNotToUse`);
      if (!e.guidance || e.guidance.length < 2) errors.push(`${at}: needs guidance for at least two options`);
    }
    if (e.type === "decision" && !neighbours(e.id).some((n) => n.type === "failure-pattern")) {
      errors.push(`${at}: decision must link to at least one failure pattern`);
    }
    if (e.type === "failure-pattern") {
      for (const k of ["causes", "warningSigns", "prevention", "recovery"] as const) {
        if (!hasSection(e, k)) errors.push(`${at}: failure pattern missing ${k}`);
      }
      const causedBy = neighbours(e.id).some((n) => n.type !== "failure-pattern" && n.type !== "concept");
      if (!causedBy) errors.push(`${at}: failure pattern must link to a decision, pattern or technology`);
    }
    if (e.type === "case-study" && (!e.sources || e.sources.length === 0)) {
      errors.push(`${at}: case study needs sources`);
    }
    if (e.type === "review" && (!e.criteria || e.criteria.length === 0)) {
      errors.push(`${at}: review needs criteria`);
    }
  }

  for (const l of content.layers) {
    for (const s of l.subcategories) {
      for (const t of s.topics) {
        if (t.entity && !ids.has(t.entity)) {
          errors.push(`layer ${l.id}/${s.id}: topic "${t.title}" links missing entity "${t.entity}"`);
        }
      }
    }
  }

  const journeyIds = new Set<string>();
  for (const j of content.journeys) {
    if (!ATLAS_ID_PATTERN.test(j.id)) errors.push(`journey ${j.id}: id must be a lowercase slug`);
    if (journeyIds.has(j.id)) errors.push(`journey ${j.id}: duplicate id`);
    journeyIds.add(j.id);
    if (j.steps.length < 2) errors.push(`journey ${j.id}: needs at least two steps`);
    for (const s of j.steps) {
      if (!ids.has(s.entity)) errors.push(`journey ${j.id}: step links missing entity "${s.entity}"`);
    }
  }

  return errors;
}
