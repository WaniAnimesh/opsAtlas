import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "../app/page";
import { getFeaturedIncidents } from "../lib/featured";

describe("HomePage", () => {
  it("has a single h1 of at most 10 words and a descriptive sentence", () => {
    render(<HomePage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    const words = (h1s[0]?.textContent ?? "").trim().split(/\s+/);
    expect(words.length).toBeLessThanOrEqual(10);
    const hero = h1s[0]?.closest("section") as HTMLElement;
    expect(hero.querySelectorAll("p")).toHaveLength(1);
  });

  it("links the two CTAs to /atlas and /simulator", () => {
    render(<HomePage />);
    const atlas = screen.getByRole("link", { name: /explore the atlas/i });
    const sim = screen.getByRole("link", { name: /start the simulator/i });
    expect(atlas.getAttribute("href")).toMatch(/^\/atlas\/?$/);
    expect(sim.getAttribute("href")).toMatch(/^\/simulator\/?$/);
  });

  it("shows 3-6 featured incidents with title, provider and domain", () => {
    const data = getFeaturedIncidents();
    expect(data.length).toBeGreaterThanOrEqual(3);
    expect(data.length).toBeLessThanOrEqual(6);
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

  it("presents the five how-it-works steps", () => {
    render(<HomePage />);
    const steps = screen.getAllByTestId("step");
    expect(steps).toHaveLength(5);
    ["Discover", "Understand", "Practice", "Reflect", "Improve"].forEach(
      (name, i) => {
        expect(
          within(steps[i] as HTMLElement).getByRole("heading", { name: new RegExp(name) }),
        ).toBeTruthy();
        expect(steps[i]?.querySelectorAll("p").length).toBe(1);
      },
    );
  });
});

