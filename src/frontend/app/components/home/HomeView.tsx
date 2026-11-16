import Link from "next/link";
import type { ReactNode } from "react";
import type { FeaturedIncident } from "../../../lib/featured";

export const HEADLINE = "Learn operations from real incidents";
export const HERO_SENTENCE =
  "Study public postmortems, then practise the same decisions in a simulator.";

export const STEPS: ReadonlyArray<{ name: string; text: string }> = [
  { name: "Discover", text: "Browse real incidents by provider and failure domain." },
  { name: "Understand", text: "Read sourced timelines, causes and confidence labels." },
  { name: "Practice", text: "Run a scenario and make decisions under time pressure." },
  { name: "Reflect", text: "Review your decisions against what was knowable then." },
  { name: "Improve", text: "Track skills over time and repeat weaker areas." },
];

const ctaBase =
  "inline-block rounded-md px-5 py-2.5 font-semibold no-underline border border-accent";

export function HomeView({
  featured,
}: {
  featured: FeaturedIncident[];
}): ReactNode {
  return (
    <>
      <section aria-labelledby="hero-heading" className="py-4 sm:py-8">
        <h1 id="hero-heading" className="m-0 text-3xl font-bold sm:text-4xl">
          {HEADLINE}
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted sm:text-lg">
          {HERO_SENTENCE}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/atlas/" className={`${ctaBase} bg-accent text-bg`}>
            Explore the Atlas
          </Link>
          <Link href="/simulator/" className={`${ctaBase} text-accent`}>
            Start the Simulator
          </Link>
        </div>
      </section>

      <section aria-labelledby="featured-heading" className="mt-8">
        <h2 id="featured-heading" className="text-2xl font-semibold">
          Featured incidents
        </h2>
        <ul className="mt-4 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((i) => (
            <li
              key={i.slug}
              data-testid="featured-item"
              className="rounded-md border border-border bg-surface p-4"
            >
              <h3 className="m-0 text-lg font-semibold">{i.title}</h3>
              <p className="mt-2 mb-0 text-sm text-muted">
                <span className="sr-only">Provider: </span>
                {i.org}
              </p>
              <p className="mt-2 mb-0">
                <span className="sr-only">Failure domain: </span>
                <span className="rounded border border-border px-2 py-0.5 font-mono text-xs text-fg">
                  {i.failureDomain}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-heading" className="mt-8">
        <h2 id="how-heading" className="text-2xl font-semibold">
          How it works
        </h2>
        <ol className="mt-4 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, idx) => (
            <li
              key={s.name}
              data-testid="step"
              className="rounded-md border border-border bg-surface p-4"
            >
              <h3 className="m-0 text-base font-semibold">
                <span aria-hidden="true" className="mr-2 font-mono text-accent">
                  {idx + 1}
                </span>
                {s.name}
              </h3>
              <p className="mt-2 mb-0 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
