/**
 * Req 18.5: proves the ESLint sandbox block flags forbidden APIs in the
 * Simulation Runtime and accepts pure code.
 */
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const FIXTURE_PATH = "src/modules/simulation-runtime/__sandbox_fixture__.ts";

async function lint(code: string): Promise<string[]> {
  // The snippet is virtual (not in tsconfig), so type-aware rules are disabled;
  // the sandbox rules under test are syntactic and remain active.
  const eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfig: {
      languageOptions: { parserOptions: { project: null } },
      rules: {
        "@typescript-eslint/no-floating-promises": "off",
        "@typescript-eslint/await-thenable": "off",
        "@typescript-eslint/no-misused-promises": "off",
        "@typescript-eslint/no-implied-eval": "off",
      },
    },
  });
  const [result] = await eslint.lintText(code, { filePath: FIXTURE_PATH });
  return (result?.messages ?? []).map((m) => m.ruleId ?? "parse-error");
}

describe("simulation-runtime sandbox lint (Req 18.5)", { timeout: 60_000 }, () => {
  it("accepts pure code", async () => {
    expect(await lint("export const add = (a: number, b: number): number => a + b;\n")).toEqual([]);
  });

  it.each([
    [
      'import { readFileSync } from "fs";\nexport const x = readFileSync;\n',
      "no-restricted-imports",
    ],
    [
      'import { exec } from "node:child_process";\nexport const x = exec;\n',
      "no-restricted-imports",
    ],
    ['import https from "https";\nexport const x = https;\n', "no-restricted-imports"],
    ["export const x = (): unknown => fetch('http://example.com');\n", "no-restricted-globals"],
    ["export const x = (): unknown => globalThis.fetch;\n", "no-restricted-properties"],
    ["export const x = (): unknown => process.binding('fs');\n", "no-restricted-properties"],
    ["export const x = (): unknown => eval('1');\n", "no-eval"],
    ["export const x = (): unknown => new Function('return 1');\n", "no-new-func"],
    ["export const x = (): unknown => import('fs');\n", "no-restricted-syntax"],
  ])("flags forbidden usage: %s", async (code, rule) => {
    expect(await lint(code)).toContain(rule);
  });
});
