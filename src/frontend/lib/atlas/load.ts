/**
 * Build-time (server-only) loader for Decision Atlas content in content/atlas.
 * Uses node:fs; never import from client components. Integrity errors throw so
 * the static build fails instead of shipping broken links (PRD 14.2).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildGraph, type AtlasGraph, type GraphPayload } from "./graph";
import { TYPE_ORDER } from "./meta";
import { journeyToSearchDoc, toSearchDoc, type SearchDoc } from "./search";
import type { AtlasContent, AtlasEntity, EntityType, Journey, Layer } from "./types";
import { validateAtlas } from "./validate";

export function getAtlasDir(): string {
  const override = process.env["OPSATLAS_ATLAS_DIR"];
  return override ? path.resolve(override) : path.resolve(process.cwd(), "../../content/atlas");
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function listJson(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((n) => path.join(dir, n));
}

function incidentSlugs(atlasDir: string): Set<string> {
  const dir = path.resolve(atlasDir, "../incidents");
  const slugs = new Set<string>();
  for (const f of listJson(dir)) {
    try {
      const slug = (readJson(f) as { slug?: unknown }).slug;
      if (typeof slug === "string") slugs.add(slug);
    } catch {
      /* invalid incident files are reported by validate-content */
    }
  }
  return slugs;
}

/** Reads content/atlas from disk. Entity files hold arrays of entities. */
export function readAtlasContent(dir: string = getAtlasDir()): AtlasContent {
  const layers = readJson(path.join(dir, "layers.json")) as Layer[];
  const journeys = readJson(path.join(dir, "journeys.json")) as Journey[];
  const entities = listJson(path.join(dir, "entities")).flatMap((f) => readJson(f) as AtlasEntity[]);
  return { layers, entities, journeys };
}

export interface Atlas extends AtlasContent {
  graph: AtlasGraph;
  layerById: Map<string, Layer>;
}

let cached: Atlas | null = null;

export function getAtlas(): Atlas {
  if (cached) return cached;
  const dir = getAtlasDir();
  const content = readAtlasContent(dir);
  const errors = validateAtlas(content, incidentSlugs(dir));
  if (errors.length > 0) {
    throw new Error(`Decision Atlas content is invalid:\n  ${errors.join("\n  ")}`);
  }
  const published = content.entities.filter((e) => e.status === "published");
  cached = {
    layers: [...content.layers].sort((a, b) => a.number - b.number),
    entities: published,
    journeys: content.journeys,
    graph: buildGraph(published),
    layerById: new Map(content.layers.map((l) => [l.id, l])),
  };
  return cached;
}

export function getEntity(id: string): AtlasEntity | null {
  return getAtlas().graph.nodes.get(id) ?? null;
}

export function entitiesOfType(type: EntityType): AtlasEntity[] {
  return getAtlas()
    .entities.filter((e) => e.type === type)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function entitiesInLayer(layerId: string): AtlasEntity[] {
  return getAtlas()
    .entities.filter((e) => e.layer === layerId || (e.secondaryLayers ?? []).includes(layerId))
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.title.localeCompare(b.title));
}

export function getJourney(id: string): Journey | null {
  return getAtlas().journeys.find((j) => j.id === id) ?? null;
}

export function journeysTouching(ids: ReadonlySet<string>): Journey[] {
  return getAtlas().journeys.filter((j) => j.steps.some((s) => ids.has(s.entity)));
}

export function buildSearchDocs(): SearchDoc[] {
  const atlas = getAtlas();
  return [
    ...atlas.entities.map((e) => toSearchDoc(e, atlas.layerById.get(e.layer)?.title)),
    ...atlas.journeys.map(journeyToSearchDoc),
  ];
}

/** Minimal node/edge payload for the client graph explorer. */
export function buildGraphPayload(): GraphPayload {
  const { entities, graph } = getAtlas();
  return {
    nodes: entities.map((e) => ({ id: e.id, title: e.title, type: e.type, layer: e.layer })),
    edges: graph.edges.map(({ id: _id, ...rest }) => rest),
  };
}
