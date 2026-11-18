import Link from "next/link";
import type { ReactNode } from "react";
import type { FeaturedIncident } from "../../../lib/featured";
import type { Journey, Layer } from "../../../lib/atlas/types";
import { entityHref, journeyHref } from "../../../lib/atlas/meta";
import { LayerGrid } from "../atlas/LayerGrid";

export const HEADLINE = "Navigate Architecture Decisions. Understand the Tradeoffs. Build Better Systems.";
export const HERO_SENTENCE =
  "A decision-centric knowledge platform for engineers and architects navigating cloud infrastructure, distributed systems, reliability, performance, security, and platform engineering.";

export const ENTRY_POINTS: ReadonlyArray<{ label: string; href: string; primary?: boolean }> = [
  { label: "Explore Architecture Decisions", href: "/decisions/", primary: true },
  { label: "Browse Technologies", href: "/technologies/" },
  { label: "Explore Failure Patterns", href: "/failure-patterns/" },
  { label: "Navigate the Knowledge Graph", href: "/graph/" },
];

const ctaBase = "inline-block rounded-md px-4 py-2.5 font-semibold no-underline border border-accent";

export interface HomeQuestion {
  q: string;
  href: string;
}

export interface JourneyPreviewStep {
  id: string;
  type: Parameters<typeof entityHref>[0]["type"];
  title: string;
  why: string;
}

export interface HomeViewProps {
  questions: HomeQuestion[];
  journeys: Journey[];
  featuredJourney: { journey: Journey; steps: JourneyPreviewStep[] } | null;
  layers: Layer[];
  layerCounts: Record<string, number>;
  featured: FeaturedIncident[];
  stats: { entities: number; relations: number; layers: number };
}

export function HomeView({ questions, journeys, featuredJourney, layers, layerCounts, featured, stats }: HomeViewProps): ReactNode {
  return (
    <>
      <section aria-labelledby="hero-heading" className="py-4 sm:py-8">
        <h1 id="hero-heading" className="m-0 max-w-4xl text-3xl font-bold sm:text-4xl">
          {HEADLINE}
        </h1>
        <p className="mt-3 max-w-3xl text-base text-muted sm:text-lg">{HERO_SENTENCE}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {ENTRY_POINTS.map((e) => (
            <Link key={e.href} href={e.href} className={`${ctaBase} ${e.primary ? "bg-accent text-bg" : "text-accent"}`}>
              {e.label}
            </Link>
          ))}
        </div>
        <dl className="mt-6 flex flex-wrap gap-6 text-sm">
          <div>
            <dt className="text-muted">Topics</dt>
            <dd className="m-0 font-mono text-lg font-semibold">{stats.entities}</dd>
          </div>
          <div>
            <dt className="text-muted">Typed relationships</dt>
            <dd className="m-0 font-mono text-lg font-semibold">{stats.relations}</dd>
          </div>
          <div>
            <dt className="text-muted">Knowledge layers</dt>
            <dd className="m-0 font-mono text-lg font-semibold">{stats.layers}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="questions-heading" className="mt-6">
        <h2 id="questions-heading" className="text-2xl font-semibold">
          Start with a question
        </h2>
        <ul className="mt-3 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3" data-testid="home-questions">
          {questions.map((q) => (
            <li key={q.q}>
              <Link
                href={q.href}
                className="block rounded-md border border-border bg-surface px-4 py-3 font-medium text-accent no-underline hover:border-accent hover:underline"
              >
                {q.q}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {featuredJourney ? (
        <section aria-labelledby="journey-heading" className="mt-10">
          <h2 id="journey-heading" className="text-2xl font-semibold">
            A decision journey: {featuredJourney.journey.title.toLowerCase()}
          </h2>
          <p className="mt-1 max-w-3xl text-muted">{featuredJourney.journey.summary}</p>
          <ol className="mt-3 flex list-none flex-wrap items-center gap-2 p-0" data-testid="journey-preview">
            {featuredJourney.steps.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                {i > 0 ? <span aria-hidden="true" className="text-muted">→</span> : null}
                <Link
                  href={entityHref(s)}
                  title={s.why}
                  className="rounded border border-border bg-surface px-2 py-1 text-sm text-accent no-underline hover:underline"
                >
                  {s.title}
                </Link>
              </li>
            ))}
          </ol>
          <p className="mt-3">
            <Link href={journeyHref(featuredJourney.journey.id)} className="font-medium text-accent">
              Follow the journey with explanations for every step
            </Link>
          </p>
        </section>
      ) : null}

      <section aria-labelledby="problems-heading" className="mt-10">
        <h2 id="problems-heading" className="text-2xl font-semibold">
          Start from a problem
        </h2>
        <ul className="mt-3 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          {journeys.map((j) => (
            <li key={j.id}>
              <Link href={journeyHref(j.id)} className="text-accent underline-offset-4 hover:underline">
                {j.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="layers-heading" className="mt-10">
        <h2 id="layers-heading" className="text-2xl font-semibold">
          The 19 layers of the Atlas
        </h2>
        <LayerGrid layers={layers} counts={layerCounts} />
      </section>

      {featured.length > 0 ? (
        <section aria-labelledby="featured-heading" className="mt-10">
          <h2 id="featured-heading" className="text-2xl font-semibold">
            Learn from real incidents
          </h2>
          <p className="mt-1 text-muted">
            Sourced postmortems from the OpsAtlas incident library. Practise the same decisions in the{" "}
            <Link href="/simulator/" className="text-accent">
              simulator
            </Link>
            .
          </p>
          <ul className="mt-4 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((i) => (
              <li key={i.slug} data-testid="featured-item" className="rounded-md border border-border bg-surface p-4">
                <h3 className="m-0 text-lg font-semibold">
                  <Link href={`/atlas/incidents/${i.slug}/`} className="text-accent underline-offset-4 hover:underline">
                    {i.title}
                  </Link>
                </h3>
                <p className="mt-2 mb-0 text-sm text-muted">
                  <span className="sr-only">Provider: </span>
                  {i.org}
                </p>
                <p className="mt-2 mb-0">
                  <span className="sr-only">Failure domain: </span>
                  <span className="rounded border border-border px-2 py-0.5 font-mono text-xs text-fg">{i.failureDomain}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
