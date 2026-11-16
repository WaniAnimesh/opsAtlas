import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

function token(name: string): string {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!m?.[1]) throw new Error(`token --color-${name} not found`);
  return m[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5;
const UI = 3;

/** [foreground token, background token, threshold]; "white" is #ffffff. */
const PAIRS: [string, string, number][] = [
  ["fg", "bg", TEXT],
  ["fg", "surface", TEXT],
  ["muted", "bg", TEXT],
  ["muted", "surface", TEXT],
  ["accent", "bg", TEXT],
  ["accent", "surface", TEXT],
  ["danger", "bg", TEXT],
  ["danger", "surface", TEXT],
  ["success", "bg", TEXT],
  ["success", "surface", TEXT],
  ["white", "accent", TEXT],
  ["border", "bg", UI],
  ["border", "surface", UI],
  ["focus", "bg", UI],
  ["focus", "surface", UI],
];

const resolve = (n: string): string => (n === "white" ? "#ffffff" : token(n));

describe("light theme contrast (WCAG 2.2 AA)", () => {
  it.each(PAIRS)("%s on %s meets %s:1", (fg, bg, min) => {
    expect(contrast(resolve(fg), resolve(bg))).toBeGreaterThanOrEqual(min);
  });

  it("uses the light colour scheme only", () => {
    expect(css).toMatch(/color-scheme:\s*light/);
    expect(css.toLowerCase()).not.toContain("dark");
  });
});
