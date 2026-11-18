"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { connectionsOf, graphFromEdges, neighborhood, type GraphNodeSummary, type GraphPayload } from "../../lib/atlas/graph";
import { entityHref, FAMILY_LABEL, RELATION_META, TYPE_COLOR, TYPE_META, TYPE_ORDER } from "../../lib/atlas/meta";
import type { RelationFamily } from "../../lib/atlas/types";

const WIDTH = 900;
const HEIGHT = 660;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const R1 = 175;
const R2 = 295;
const FAMILIES: RelationFamily[] = ["decision", "technology", "operational", "failure", "learning"];
const FAMILY_STROKE: Record<RelationFamily, string> = {
  decision: "#0550ae",
  technology: "#1a7f37",
  operational: "#8a5a00",
  failure: "#b42318",
  learning: "#6e7781",
};

interface Placed {
  node: GraphNodeSummary;
  depth: number;
  x: number;
  y: number;
  angle: number;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function typeRank(n: GraphNodeSummary): number {
  return TYPE_ORDER.indexOf(n.type);
}

export function GraphExplorer({ payload, defaultFocus }: { payload: GraphPayload; defaultFocus: string }): ReactNode {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const graph = useMemo(() => graphFromEdges(payload.nodes, payload.edges), [payload]);

  const requested = params.get("focus") ?? "";
  // The URL picks the initial focus; after that, in-page navigation owns it.
  const [selected, setSelected] = useState<string | null>(null);
  const focus = selected ?? (graph.nodes.has(requested) ? requested : defaultFocus);
  const [trail, setTrail] = useState<string[]>([]);
  const [depth, setDepth] = useState<1 | 2>(1);
  const [families, setFamilies] = useState<Set<RelationFamily>>(new Set(FAMILIES));
  const [hovered, setHovered] = useState<string | null>(null);

  function show(id: string): void {
    setSelected(id);
    setHovered(null);
    router.replace(`${pathname}?focus=${encodeURIComponent(id)}`, { scroll: false });
  }

  function goTo(id: string): void {
    if (id === focus || !graph.nodes.has(id)) return;
    setTrail((t) => [...t, focus].slice(-10));
    show(id);
  }

  function goBack(): void {
    const prev = trail[trail.length - 1];
    if (!prev) return;
    setTrail((t) => t.slice(0, -1));
    show(prev);
  }

  const hood = useMemo(() => neighborhood(graph, focus, depth, families, depth === 1 ? 40 : 60), [graph, focus, depth, families]);

  const placed = useMemo(() => {
    const out = new Map<string, Placed>();
    const focusNode = graph.nodes.get(focus);
    if (!focusNode) return out;
    out.set(focus, { node: focusNode, depth: 0, x: CX, y: CY, angle: 0 });
    const ring1 = hood.nodes
      .filter((n) => n.depth === 1)
      .map((n) => graph.nodes.get(n.id))
      .filter((n): n is GraphNodeSummary => n !== undefined)
      .sort((a, b) => typeRank(a) - typeRank(b) || a.title.localeCompare(b.title));
    ring1.forEach((node, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(ring1.length, 1);
      out.set(node.id, { node, depth: 1, angle, x: CX + R1 * Math.cos(angle), y: CY + R1 * Math.sin(angle) });
    });
    const ring2 = hood.nodes
      .filter((n) => n.depth === 2)
      .map((n) => {
        const node = graph.nodes.get(n.id);
        if (!node) return null;
        // Circular mean of the angles of depth-1 neighbours keeps children near parents.
        let sx = 0;
        let sy = 0;
        for (const c of connectionsOf(graph, n.id)) {
          const p = out.get(c.other);
          if (p && p.depth === 1) {
            sx += Math.cos(p.angle);
            sy += Math.sin(p.angle);
          }
        }
        return { node, pref: Math.atan2(sy, sx) };
      })
      .filter((x): x is { node: GraphNodeSummary; pref: number } => x !== null)
      .sort((a, b) => a.pref - b.pref);
    ring2.forEach(({ node }, i) => {
      const angle = -Math.PI + (i * 2 * Math.PI) / Math.max(ring2.length, 1) + Math.PI / Math.max(ring2.length, 1);
      out.set(node.id, { node, depth: 2, angle, x: CX + R2 * Math.cos(angle), y: CY + R2 * Math.sin(angle) });
    });
    return out;
  }, [graph, hood, focus]);

  const active = hovered ?? focus;
  const activeNode = graph.nodes.get(active);
  const focusNode = graph.nodes.get(focus);
  const ring2Count = [...placed.values()].filter((p) => p.depth === 2).length;
  const focusConnections = connectionsOf(graph, focus)
    .filter((c) => families.has(RELATION_META[c.edge.type].family))
    .sort((a, b) => a.label.localeCompare(b.label) || (graph.nodes.get(a.other)?.title ?? "").localeCompare(graph.nodes.get(b.other)?.title ?? ""));

  function onNodeKey(e: KeyboardEvent<SVGGElement>, id: string): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goTo(id);
    }
  }

  function toggleFamily(f: RelationFamily): void {
    setFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  const sortedNodes = useMemo(
    () => [...payload.nodes].sort((a, b) => typeRank(a) - typeRank(b) || a.title.localeCompare(b.title)),
    [payload.nodes],
  );

  if (!focusNode) return <p>Graph is empty.</p>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-4 rounded-md border border-border bg-surface p-3">
        <div className="grid gap-1">
          <label htmlFor="graph-focus" className="text-sm font-medium">
            Focus topic
          </label>
          <select
            id="graph-focus"
            value={focus}
            onChange={(e) => goTo(e.target.value)}
            className="max-w-xs rounded border border-border bg-bg p-1.5 text-sm"
          >
            {TYPE_ORDER.map((t) => (
              <optgroup key={t} label={TYPE_META[t].plural}>
                {sortedNodes
                  .filter((n) => n.type === t)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <fieldset className="m-0 flex gap-3 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">Depth</legend>
          {[1, 2].map((d) => (
            <label key={d} className="flex items-center gap-1 text-sm">
              <input type="radio" name="depth" checked={depth === d} onChange={() => setDepth(d as 1 | 2)} />
              {d === 1 ? "Direct connections" : "Two steps"}
            </label>
          ))}
        </fieldset>
        <fieldset className="m-0 flex flex-wrap gap-3 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">Relationship families</legend>
          {FAMILIES.map((f) => (
            <label key={f} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={families.has(f)} onChange={() => toggleFamily(f)} />
              <span aria-hidden="true" className="inline-block h-0.5 w-4" style={{ backgroundColor: FAMILY_STROKE[f] }} />
              {FAMILY_LABEL[f]}
            </label>
          ))}
        </fieldset>
        {trail.length > 0 ? (
          <button type="button" onClick={goBack} className="rounded border border-accent px-3 py-1.5 text-sm font-medium text-accent">
            ← Back to {graph.nodes.get(trail[trail.length - 1] ?? "")?.title}
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="overflow-hidden rounded-md border border-border bg-bg">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full"
            aria-labelledby="graph-title graph-desc"
            data-testid="graph-svg"
          >
            <title id="graph-title">Knowledge graph around {focusNode.title}</title>
            <desc id="graph-desc">
              {placed.size - 1} connected topics. Select a node to re-center the graph. The list below the graph contains
              the same connections as text.
            </desc>
            <defs>
              {FAMILIES.map((f) => (
                <marker key={f} id={`arrow-${f}`} viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={FAMILY_STROKE[f]} />
                </marker>
              ))}
            </defs>
            <g>
              {hood.edges.map((e) => {
                const a = placed.get(e.source);
                const b = placed.get(e.target);
                if (!a || !b) return null;
                const fam = RELATION_META[e.type].family;
                const touches = e.source === active || e.target === active;
                const showLabel = hovered !== null && hovered !== focus && touches;
                return (
                  <g key={e.id} opacity={touches ? 0.95 : 0.25}>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={FAMILY_STROKE[fam]}
                      strokeWidth={touches ? 2 : 1}
                      markerEnd={`url(#arrow-${fam})`}
                    />
                    {showLabel ? (
                      <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle" fontSize="11" fill="#1f2328" paintOrder="stroke" stroke="#ffffff" strokeWidth="3">
                        {RELATION_META[e.type].label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
            <g>
              {[...placed.values()].map((p) => {
                const isFocus = p.depth === 0;
                const r = isFocus ? 16 : p.depth === 1 ? 10 : 7;
                const showText = isFocus || p.depth === 1 || ring2Count <= 16 || hovered === p.node.id;
                const right = Math.cos(p.angle) >= 0;
                return (
                  <g
                    key={p.node.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${p.node.title}, ${TYPE_META[p.node.type].label}${isFocus ? ", current focus" : ". Select to focus"}`}
                    onClick={() => goTo(p.node.id)}
                    onKeyDown={(e) => onNodeKey(e, p.node.id)}
                    onMouseEnter={() => setHovered(p.node.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(p.node.id)}
                    onBlur={() => setHovered(null)}
                    className="cursor-pointer outline-none"
                    data-testid="graph-node"
                  >
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={r}
                      fill={TYPE_COLOR[p.node.type]}
                      stroke={hovered === p.node.id ? "#0969da" : "#ffffff"}
                      strokeWidth={hovered === p.node.id ? 4 : 2}
                    />
                    {showText ? (
                      <text
                        x={isFocus ? p.x : p.x + (right ? r + 4 : -(r + 4))}
                        y={isFocus ? p.y + r + 16 : p.y + 4}
                        textAnchor={isFocus ? "middle" : right ? "start" : "end"}
                        fontSize={isFocus ? 14 : 11}
                        fontWeight={isFocus ? 700 : 400}
                        fill="#1f2328"
                        paintOrder="stroke"
                        stroke="#ffffff"
                        strokeWidth="3"
                      >
                        {truncate(p.node.title, isFocus ? 48 : 30)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </svg>
          {hood.truncated ? (
            <p className="m-0 border-t border-border p-2 text-xs text-muted">
              Showing the closest {placed.size} topics. Narrow the relationship families or re-center to see others.
            </p>
          ) : null}
        </div>

        <aside aria-label="Selected topic" className="grid content-start gap-3">
          {activeNode ? (
            <div className="rounded-md border border-border bg-surface p-4" aria-live="polite">
              <p className="m-0 text-xs text-muted">{active === focus ? "Focus" : "Hovered"}</p>
              <h2 className="mt-1 mb-0 text-lg font-semibold">{activeNode.title}</h2>
              <p className="mt-1 mb-0 text-sm text-muted">{TYPE_META[activeNode.type].label}</p>
              <p className="mt-3 mb-0">
                <Link href={entityHref(activeNode)} className="font-medium text-accent underline-offset-4 hover:underline">
                  Open page
                </Link>
              </p>
            </div>
          ) : null}
          <div className="rounded-md border border-border p-4">
            <h2 className="m-0 text-sm font-semibold">Node types</h2>
            <ul className="mt-2 mb-0 grid list-none gap-1 p-0 text-sm">
              {TYPE_ORDER.map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: TYPE_COLOR[t] }} />
                  {TYPE_META[t].label}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <section aria-labelledby="conn-h">
        <h2 id="conn-h" className="m-0 text-xl font-semibold">
          Connections of {focusNode.title}
        </h2>
        <p className="mt-1 text-sm text-muted">Text alternative to the graph. Relationships are read from {focusNode.title}&apos;s point of view.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm" data-testid="graph-connections">
            <thead>
              <tr>
                <th scope="col" className="border-b border-border p-2 text-left">
                  Relationship
                </th>
                <th scope="col" className="border-b border-border p-2 text-left">
                  Topic
                </th>
                <th scope="col" className="border-b border-border p-2 text-left">
                  Why it matters
                </th>
                <th scope="col" className="border-b border-border p-2 text-left">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {focusConnections.map((c) => {
                const other = graph.nodes.get(c.other);
                if (!other) return null;
                return (
                  <tr key={`${c.edge.id}-${c.direction}`} className="align-top">
                    <td className="border-b border-border p-2">{c.label}</td>
                    <td className="border-b border-border p-2">
                      <Link href={entityHref(other)} className="text-accent underline-offset-4 hover:underline">
                        {other.title}
                      </Link>
                      <span className="block text-xs text-muted">{TYPE_META[other.type].label}</span>
                    </td>
                    <td className="border-b border-border p-2 text-muted">{c.edge.note ?? ""}</td>
                    <td className="border-b border-border p-2">
                      <button type="button" onClick={() => goTo(other.id)} className="text-sm text-accent underline">
                        Focus<span className="sr-only"> {other.title}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
