import type { ReactNode } from "react";
import { HomeView, type HomeQuestion, type JourneyPreviewStep } from "./components/home/HomeView";
import { getFeaturedIncidents } from "../lib/featured";
import { entitiesInLayer, getAtlas } from "../lib/atlas/load";
import { entityHref, journeyHref } from "../lib/atlas/meta";
import { ENTRY_QUESTIONS } from "../lib/atlas/questions";

const FEATURED_JOURNEY = "scale-my-system";

export default function HomePage(): ReactNode {
  const atlas = getAtlas();
  const questions: HomeQuestion[] = ENTRY_QUESTIONS.flatMap((q) => {
    if (q.target.startsWith("journey:")) {
      const id = q.target.slice("journey:".length);
      return atlas.journeys.some((j) => j.id === id) ? [{ q: q.question, href: journeyHref(id) }] : [];
    }
    const e = atlas.graph.nodes.get(q.target);
    return e ? [{ q: q.question, href: entityHref(e) }] : [];
  });

  const journey = atlas.journeys.find((j) => j.id === FEATURED_JOURNEY) ?? null;
  const featuredJourney = journey
    ? {
        journey,
        steps: journey.steps.flatMap<JourneyPreviewStep>((s) => {
          const e = atlas.graph.nodes.get(s.entity);
          return e ? [{ id: e.id, type: e.type, title: e.title, why: s.why }] : [];
        }),
      }
    : null;

  return (
    <HomeView
      questions={questions}
      journeys={atlas.journeys}
      featuredJourney={featuredJourney}
      layers={atlas.layers}
      layerCounts={Object.fromEntries(atlas.layers.map((l) => [l.id, entitiesInLayer(l.id).length]))}
      featured={getFeaturedIncidents()}
      stats={{ entities: atlas.entities.length, relations: atlas.graph.edges.length, layers: atlas.layers.length }}
    />
  );
}
