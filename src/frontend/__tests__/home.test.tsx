import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "../app/page";
import { ENTRY_POINTS, HEADLINE } from "../app/components/home/HomeView";
import { getFeaturedIncidents } from "../lib/featured";
import { ENTRY_QUESTIONS } from "../lib/atlas/questions";

describe("HomePage", () => {
  it("has a single h1 with the value proposition and one descriptive sentence", () => {
    render(<HomePage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe(HEADLINE);
    const hero = h1s[0]?.closest("section") as HTMLElement;
    expect(hero.querySelectorAll("p")).toHaveLength(1);
  });

  it("links the four primary entry points", () => {
    render(<HomePage />);
    for (const e of ENTRY_POINTS) {
      expect(screen.getByRole("link", { name: e.label })).toHaveAttribute("href", expect.stringMatching(new RegExp(`^${e.href}?$`)));
    }
  });

  it("offers problem-oriented questions that resolve to pages", () => {
    render(<HomePage />);
    const list = screen.getByTestId("home-questions");
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(ENTRY_QUESTIONS.length);
    links.forEach((l) => expect(l.getAttribute("href")).toMatch(/^\/(decisions|comparisons|journeys)\//));
  });

  it("previews the 'scale my system' journey in order", () => {
    render(<HomePage />);
    const steps = within(screen.getByTestId("journey-preview")).getAllByRole("link");
    expect(steps[0]?.textContent).toBe("Scaling Fundamentals");
    expect(steps.at(-1)?.textContent).toBe("Reliability Engineering");
    expect(steps.map((s) => s.textContent)).toContain("Service Discovery");
  });

  it("shows all 19 layers", () => {
    render(<HomePage />);
    expect(within(screen.getByTestId("layer-grid")).getAllByRole("listitem")).toHaveLength(19);
  });

  it("still features real incidents with title, provider and domain", () => {
    const data = getFeaturedIncidents();
    render(<HomePage />);
    const items = screen.getAllByTestId("featured-item");
    expect(items).toHaveLength(data.length);
    data.forEach((d, i) => {
      const w = within(items[i] as HTMLElement);
      expect(w.getByRole("heading", { name: d.title })).toBeTruthy();
      expect(w.getByText(d.org)).toBeTruthy();
      expect(w.getByText(d.failureDomain)).toBeTruthy();
    });
  });
});
