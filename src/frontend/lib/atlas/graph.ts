/** Knowledge graph built from entity relations. Pure; safe for client and server. */
import { NEXT_STEP_TYPES, RELATION_META } from "./meta";
import type { AtlasEntity, EntityType, RelationFamily, RelationType } from "./types";

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  note?: string;
}

export interface Connection {
  /** The entity at the other end of the edge. */
  other: string;
  edge: GraphEdge;
  direction: "out" | "in";
  /** Relation label read from the current entity's point of view. */
  label: string;
}

export interface Graph<N extends { id: string }> {
  nodes: Map<string, N>;
  edges: GraphEdge[];
  outgoing: Map<string, GraphEdge[]>;
  incoming: Map<string, GraphEdge[]>;
}

export type AtlasGraph = Graph<AtlasEntity>;

export function edgeId(source: string, type: RelationType, target: string): string {
  return `${source}--${type}--${target}`;
}

/** Indexes nodes and edges; edges with unknown endpoints or self-loops are dropped. */
export function graphFromEdges<N extends { id: string }>(list: N[], edgeList: Omit<GraphEdge, "id">[]): Graph<N> {
  const nodes = new Map(list.map((n) => [n.id, n]));
  const edges: GraphEdge[] = [];
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const n of list) {
    outgoing.set(n.id, []);
    incoming.set(n.id, []);
  }
  for (const raw of edgeList) {
    if (!nodes.has(raw.source) || !nodes.has(raw.target) || raw.source === raw.target) continue;
    const edge: GraphEdge = { ...raw, id: edgeId(raw.source, raw.type, raw.target) };
    edges.push(edge);
    outgoing.get(raw.source)?.push(edge);
    incoming.get(raw.target)?.push(edge);
  }
  return { nodes, edges, outgoing, incoming };
}

export function buildGraph(entities: AtlasEntity[]): AtlasGraph {
  const edgeList = entities.flatMap((e) =>
    e.relations.map((r) => (r.note ? { source: e.id, target: r.target, type: r.type, note: r.note } : { source: e.id, target: r.target, type: r.type })),
  );
  return graphFromEdges(entities, edgeList);
}

/** All edges touching an entity, in both directions (PRD 6.19.4). */
export function connectionsOf<N extends { id: string }>(graph: Graph<N>, id: string): Connection[] {
  const out = (graph.outgoing.get(id) ?? []).map<Connection>((edge) => ({
    other: edge.target,
    edge,
    direction: "out",
    label: RELATION_META[edge.type].label,
  }));
  const inc = (graph.incoming.get(id) ?? []).map<Connection>((edge) => ({
    other: edge.source,
    edge,
    direction: "in",
    label: RELATION_META[edge.type].inverse,
  }));
  return [...out, ...inc];
}

export interface RelatedGroups {
  decisions: Connection[];
  technologies: Connection[];
  patterns: Connection[];
  failures: Connection[];
  frameworks: Connection[];
  concepts: Connection[];
  caseStudies: Connection[];
  reviews: Connection[];
  next: Connection[];
}

const GROUP_BY_TYPE: Record<EntityType, keyof Omit<RelatedGroups, "next">> = {
  decision: "decisions",
  comparison: "decisions",
  technology: "technologies",
  pattern: "patterns",
  "failure-pattern": "failures",
  framework: "frameworks",
  concept: "concepts",
  "case-study": "caseStudies",
  review: "reviews",
};

/** Groups connections for the "Related ..." sections; one entry per neighbour per group. */
export function relatedGroups(graph: AtlasGraph, id: string): RelatedGroups {
  const groups: RelatedGroups = {
    decisions: [],
    technologies: [],
    patterns: [],
    failures: [],
    frameworks: [],
    concepts: [],
    caseStudies: [],
    reviews: [],
    next: [],
  };
  const seen = new Set<string>();
  const conns = connectionsOf(graph, id);
  // Outgoing first so the entity's own explanation wins over the inverse.
  for (const c of conns) {
    const other = graph.nodes.get(c.other);
    if (!other) continue;
    const key = GROUP_BY_TYPE[other.type];
    const dedupe = `${key}:${c.other}`;
    if (!seen.has(dedupe)) {
      seen.add(dedupe);
      groups[key].push(c);
    }
  }
  const nextSeen = new Set<string>();
  for (const c of conns) {
    if (c.direction === "out" && NEXT_STEP_TYPES.has(c.edge.type) && !nextSeen.has(c.other)) {
      nextSeen.add(c.other);
      groups.next.push(c);
    }
  }
  return groups;
}

export interface Neighborhood {
  nodes: { id: string; depth: number }[];
  edges: GraphEdge[];
  truncated: boolean;
}

/**
 * Focused view around one node (FR-006: avoid dense default views).
 * Breadth-first to `depth`, keeping at most `maxNodes` nodes.
 */
export function neighborhood<N extends { id: string }>(
  graph: Graph<N>,
  focus: string,
  depth: number,
  families: ReadonlySet<RelationFamily>,
  maxNodes = 40,
): Neighborhood {
  if (!graph.nodes.has(focus)) return { nodes: [], edges: [], truncated: false };
  const allowed = (e: GraphEdge): boolean => families.has(RELATION_META[e.type].family);
  const depthOf = new Map<string, number>([[focus, 0]]);
  let frontier = [focus];
  let truncated = false;
  for (let d = 1; d <= depth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      const touching = [...(graph.outgoing.get(id) ?? []), ...(graph.incoming.get(id) ?? [])].filter(allowed);
      for (const e of touching) {
        const other = e.source === id ? e.target : e.source;
        if (depthOf.has(other)) continue;
        if (depthOf.size >= maxNodes) {
          truncated = true;
          continue;
        }
        depthOf.set(other, d);
        next.push(other);
      }
    }
    frontier = next;
  }
  const edges = graph.edges.filter((e) => allowed(e) && depthOf.has(e.source) && depthOf.has(e.target));
  return {
    nodes: [...depthOf.entries()].map(([id, d]) => ({ id, depth: d })),
    edges,
    truncated,
  };
}

export interface GraphNodeSummary {
  id: string;
  title: string;
  type: EntityType;
  layer: string;
}

/** Serializable graph handed to the client explorer. */
export interface GraphPayload {
  nodes: GraphNodeSummary[];
  edges: Omit<GraphEdge, "id">[];
}
