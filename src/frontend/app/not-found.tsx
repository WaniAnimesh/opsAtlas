import Link from "next/link";
import type { ReactNode } from "react";

export default function NotFound(): ReactNode {
  return (
    <>
      <h1 className="mt-0 text-3xl font-semibold">Page not found</h1>
      <p>We couldn&apos;t find that page. It may have been moved or never existed.</p>
      <ul className="grid gap-1 pl-5">
        <li>
          <Link href="/search/" className="text-accent underline">
            Search the Decision Atlas
          </Link>
        </li>
        <li>
          <Link href="/explore/" className="text-accent underline">
            Start from a problem
          </Link>
        </li>
        <li>
          <Link href="/atlas/" className="text-accent underline">
            Back to the Incident Atlas
          </Link>
        </li>
      </ul>
    </>
  );
}
