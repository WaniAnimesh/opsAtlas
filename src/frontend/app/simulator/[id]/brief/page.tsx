import path from "node:path";
import type { ReactNode } from "react";
import { BriefClient } from "./BriefClient";
import { readScenarioIds } from "./scenarioIds";

export const dynamicParams = false;

/** Scenario ids are the embedded `id` fields of content/scenarios/*.json. */
export function generateStaticParams(): { id: string }[] {
  const dir = path.resolve(process.cwd(), "../../content/scenarios");
  return readScenarioIds(dir).map((id) => ({ id }));
}

export default async function BriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  return <BriefClient scenarioId={id} />;
}
