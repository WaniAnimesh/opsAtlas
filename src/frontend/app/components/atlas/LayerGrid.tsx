import Link from "next/link";
import type { ReactNode } from "react";
import { layerHref } from "../../../lib/atlas/meta";
import type { Layer } from "../../../lib/atlas/types";

export function LayerGrid({ layers, counts }: { layers: Layer[]; counts: Record<string, number> }): ReactNode {
  return (
    <ol className="mt-3 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3" data-testid="layer-grid">
      {layers.map((l) => (
        <li key={l.id} className="rounded-md border border-border bg-surface p-4">
          <p className="m-0 font-mono text-xs text-muted">
            Layer {l.number}
            {l.priority ? ` · ${l.priority} priority` : ""}
          </p>
          <h3 className="mt-1 mb-0 text-base font-semibold">
            <Link href={layerHref(l.id)} className="text-accent underline-offset-4 hover:underline">
              {l.title}
            </Link>
          </h3>
          <p className="mt-1 mb-0 text-sm text-muted">{l.purpose}</p>
          <p className="mt-2 mb-0 text-xs text-muted">{counts[l.id] ?? 0} pages</p>
        </li>
      ))}
    </ol>
  );
}
