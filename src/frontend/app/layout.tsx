import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpsAtlas",
  description: "Incident atlas and operations simulator.",
};

const navLinkClass =
  "inline-block px-3 py-2 text-fg hover:text-accent underline-offset-4 hover:underline";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
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
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
            <Link href="/" className="font-mono text-lg font-semibold text-fg no-underline">
              OpsAtlas
            </Link>
            <nav aria-label="Primary">
              <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
                <li>
                  <Link href="/" className={navLinkClass}>
                    Home
                  </Link>
                </li>
                <li>
                  <Link href="/atlas/" className={navLinkClass}>
                    Atlas
                  </Link>
                </li>
                <li>
                  <Link href="/simulator/" className={navLinkClass}>
                    Simulator
                  </Link>
                </li>
                <li>
                  <Link href="/learning/" className={navLinkClass}>
                    Learning
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-border">
          <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted sm:px-6">
            OpsAtlas &middot; learn from real incidents
          </div>
        </footer>
      </body>
    </html>
  );
}

