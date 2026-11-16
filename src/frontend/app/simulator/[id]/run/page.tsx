import path from "node:path";
import { Suspense, type ReactNode } from "react";
import { readScenarioIds } from "../brief/scenarioIds";
import { RunClient } from "./RunClient";

export const dynamicParams = false;

/** Scenario ids are the embedded `id` fields of content/scenarios/*.json. */
export function generateStaticParams(): { id: string }[] {
  const dir = path.resolve(process.cwd(), "../../content/scenarios");
  return readScenarioIds(dir).map((id) => ({ id }));
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  return (
    <Suspense fallback={<p role="status">Loading session…</p>}>
      <RunClient scenarioId={id} />
    </Suspense>
  );
}
