import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PRACTICE_NAV, PRIMARY_NAV } from "../lib/nav";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000"),
  title: "OpsAtlas · Cloud Architecture Decision Atlas",
  description:
    "A decision-centric knowledge platform for engineers and architects navigating cloud infrastructure, distributed systems, reliability, performance, security and platform engineering.",
};

const navLinkClass = "inline-block px-2 py-1.5 text-sm text-fg hover:text-accent underline-offset-4 hover:underline";

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body className="bg-bg text-fg font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-surface focus:px-4 focus:py-2"
        >
          Skip to main content
        </a>
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-baseline gap-2 text-fg no-underline">
              <span className="font-mono text-lg font-semibold">OpsAtlas</span>
              <span className="hidden text-sm text-muted sm:inline">Cloud Architecture Decision Atlas</span>
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <form action="/search/" method="get" role="search" aria-label="Site search" className="flex items-center gap-1">
                <label htmlFor="site-search" className="sr-only">
                  Search the Atlas
                </label>
                <input
                  id="site-search"
                  name="q"
                  type="search"
                  maxLength={200}
                  placeholder="Search decisions, tech, failures…"
                  className="w-56 rounded border border-border bg-bg px-2 py-1.5 text-sm"
                />
                <button type="submit" className="rounded border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-bg">
                  Search
                </button>
              </form>
              <nav aria-label="Practice">
                <ul className="m-0 flex list-none flex-wrap gap-0 p-0">
                  {PRACTICE_NAV.map((n) => (
                    <li key={n.href}>
                      <Link href={n.href} className={navLinkClass}>
                        {n.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>
          <div className="border-t border-border">
            <nav aria-label="Primary" className="mx-auto max-w-6xl px-2 sm:px-4">
              <ul className="m-0 flex list-none flex-wrap gap-0 p-0">
                {PRIMARY_NAV.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} className={navLinkClass}>
                      {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-6 text-sm text-muted sm:px-6">
            <span>OpsAtlas &middot; users do not visit to learn technologies, they visit to make decisions</span>
            <span>
              <Link href="/search/" className="text-accent">
                Search
              </Link>{" "}
              &middot;{" "}
              <Link href="/layers/knowledge-graph/" className="text-accent">
                About the graph
              </Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
