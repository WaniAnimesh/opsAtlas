import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RootLayout from "../app/layout";
import { PRACTICE_NAV, PRIMARY_NAV } from "../lib/nav";

describe("RootLayout", () => {
  function renderBody(): void {
    // Render only the body content; <html> in a div triggers a DOM nesting warning.
    const tree = RootLayout({ children: <p>content</p> }) as React.ReactElement<{
      children: React.ReactElement<{ children: React.ReactNode }>;
    }>;
    const body = tree.props.children;
    render(<div>{body.props.children}</div>);
  }

  it("renders skip link, main landmark and footer", () => {
    renderBody();
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("renders the PRD primary navigation in order", () => {
    renderBody();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Explore",
      "Decisions",
      "Technologies",
      "Domains",
      "Failure Patterns",
      "Reviews",
      "Frameworks",
      "Case Studies",
      "Graph",
    ]);
    links.forEach((l, i) => expect(l).toHaveAttribute("href", expect.stringMatching(new RegExp(`^${PRIMARY_NAV[i]?.href.replace(/\/$/, "")}/?$`))));
  });

  it("keeps the incident atlas and simulator reachable", () => {
    renderBody();
    const nav = screen.getByRole("navigation", { name: "Practice" });
    expect(within(nav).getAllByRole("link")).toHaveLength(PRACTICE_NAV.length);
    expect(within(nav).getByRole("link", { name: "Incidents" })).toHaveAttribute("href", expect.stringMatching(/^\/atlas\/?$/));
    expect(within(nav).getByRole("link", { name: "Simulator" })).toHaveAttribute("href", expect.stringMatching(/^\/simulator\/?$/));
  });

  it("offers a global search form that submits to /search", () => {
    renderBody();
    const form = screen.getByRole("search", { name: "Site search" });
    expect(form).toHaveAttribute("action", "/search/");
    expect(within(form).getByRole("searchbox", { name: /search the atlas/i })).toHaveAttribute("name", "q");
  });
});
