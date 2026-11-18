import Link from "next/link";
import type { ReactNode } from "react";
import { entityHref, TYPE_COLOR, TYPE_META } from "../../../lib/atlas/meta";
import type { AtlasEntity, EntityType, Text } from "../../../lib/atlas/types";

export function TypeBadge({ type }: { type: EntityType | "journey" }): ReactNode {
  const label = type === "journey" ? "Decision Journey" : TYPE_META[type].label;
  const color = type === "journey" ? "#0550ae" : TYPE_COLOR[type];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border border-border bg-bg px-2 py-0.5 font-mono text-xs text-fg"
      data-testid="type-badge"
    >
      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function TextBlock({ value }: { value: Text }): ReactNode {
  if (typeof value === "string") return <p className="my-2">{value}</p>;
  return (
    <ul className="my-2 grid gap-1 pl-5">
      {value.map((v) => (
        <li key={v}>{v}</li>
      ))}
    </ul>
  );
}

export function EntityCard({
  entity,
  note,
  label,
}: {
  entity: Pick<AtlasEntity, "id" | "type" | "title" | "description" | "question">;
  note?: string;
  label?: string;
}): ReactNode {
  return (
    <li className="rounded-md border border-border bg-surface p-4" data-testid="entity-card">
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={entity.type} />
        {label ? <span className="text-xs font-medium text-muted">{label}</span> : null}
      </div>
      <h3 className="mt-2 mb-0 text-base font-semibold">
        <Link href={entityHref(entity)} className="text-accent underline-offset-4 hover:underline">
          {entity.title}
        </Link>
      </h3>
      <p className="mt-1 mb-0 text-sm text-muted">{note ?? entity.question ?? entity.description}</p>
    </li>
  );
}

export function CardGrid({ children }: { children: ReactNode }): ReactNode {
  return <ul className="mt-3 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>;
}

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }): ReactNode {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm">
      <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-muted">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <span aria-hidden="true">›</span> : null}
            {c.href ? (
              <Link href={c.href} className="text-accent underline-offset-4 hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-fg">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow?: ReactNode;
  title: string;
  lead?: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <header className="mb-6">
      {eyebrow ? <div className="mb-2 flex flex-wrap items-center gap-2">{eyebrow}</div> : null}
      <h1 className="m-0 text-3xl font-bold">{title}</h1>
      {lead ? <p className="mt-2 mb-0 max-w-3xl text-lg text-muted">{lead}</p> : null}
      {children}
    </header>
  );
}
