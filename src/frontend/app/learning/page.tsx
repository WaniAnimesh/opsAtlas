import type { Metadata } from "next";
import type { ReactNode } from "react";
import { readScenarioSkillTags } from "../../lib/scenario-skill-tags";
import { LearningView } from "./LearningView";

export const metadata: Metadata = { title: "Learning | OpsAtlas" };

/** Static shell: skill tags are embedded at build time; history is read in the browser. */
export default function LearningPage(): ReactNode {
  return <LearningView skillTagsByScenario={readScenarioSkillTags()} />;
}
