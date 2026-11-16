import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ScenarioCatalog } from "./components/ScenarioCatalog";

export const metadata: Metadata = {
  title: "Simulator | OpsAtlas",
  description: "Browse incident response scenarios.",
};

export default function SimulatorPage(): ReactNode {
  return (
    <>
      <h1 className="mb-2 text-3xl font-semibold">Simulator</h1>
      <p className="mb-6 text-muted">
        Pick a scenario, review its objective, and practice making decisions.
      </p>
      <ScenarioCatalog />
    </>
  );
}
