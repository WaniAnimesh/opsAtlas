import type { ReactNode } from "react";
import { HomeView } from "./components/home/HomeView";
import { getFeaturedIncidents } from "../lib/featured";

export default function HomePage(): ReactNode {
  return <HomeView featured={getFeaturedIncidents()} />;
}
