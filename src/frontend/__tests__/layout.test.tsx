import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RootLayout from "../app/layout";

describe("RootLayout", () => {
  it("renders skip link, primary nav, and main landmark", () => {
    // Render only the body content; <html> in a div triggers a DOM nesting warning.
    const tree = RootLayout({ children: <p>content</p> }) as React.ReactElement<{
      children: React.ReactElement<{ children: React.ReactNode }>;
    }>;
    const body = tree.props.children;
    render(<div>{body.props.children}</div>);

    expect(
      screen.getByRole("link", { name: /skip to main content/i }),
    ).toHaveAttribute("href", "#main");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Atlas" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/atlas\/?$/),
    );
    expect(screen.getByRole("link", { name: "Simulator" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/simulator\/?$/),
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});

