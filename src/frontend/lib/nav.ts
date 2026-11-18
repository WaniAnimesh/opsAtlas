/** PRD 9.2 primary navigation. */
export const PRIMARY_NAV: ReadonlyArray<{ label: string; href: string }> = [
  { label: "Explore", href: "/explore/" },
  { label: "Decisions", href: "/decisions/" },
  { label: "Technologies", href: "/technologies/" },
  { label: "Domains", href: "/layers/" },
  { label: "Failure Patterns", href: "/failure-patterns/" },
  { label: "Reviews", href: "/reviews/" },
  { label: "Frameworks", href: "/frameworks/" },
  { label: "Case Studies", href: "/case-studies/" },
  { label: "Graph", href: "/graph/" },
];

/** Hands-on OpsAtlas areas: real incidents, the simulator and progress. */
export const PRACTICE_NAV: ReadonlyArray<{ label: string; href: string }> = [
  { label: "Incidents", href: "/atlas/" },
  { label: "Simulator", href: "/simulator/" },
  { label: "Learning", href: "/learning/" },
];
