import Link from "next/link";
import type { ReactNode } from "react";

export default function NotFound(): ReactNode {
  return (
    <>
      <h1 className="mt-0 text-3xl font-semibold">Page not found</h1>
      <p>We couldn&apos;t find that page or incident. It may have been moved or never existed.</p>
      <p>
        <Link href="/atlas/" className="text-accent underline">
          Back to the Incident Atlas
        </Link>
      </p>
    </>
  );
}
