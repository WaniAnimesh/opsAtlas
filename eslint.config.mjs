import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const FORBIDDEN_MODULES = [
  "fs",
  "fs/promises",
  "child_process",
  "worker_threads",
  "net",
  "tls",
  "dgram",
  "http",
  "https",
  "http2",
  "cluster",
  "vm",
  "dns",
  "os",
  "undici",
  "axios",
  "node-fetch",
  "ws",
];
const FORBIDDEN_GLOBALS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "Worker"];
const SANDBOX_MESSAGE = "Not allowed in the Simulation Runtime sandbox (Req 18.5).";
const WORKER_MESSAGE =
  "Node-only import; code reachable from the Cloudflare Worker must stay runtime-neutral.";

/** Rules enforcing the Simulation Runtime sandbox (Req 18.5). */
export const sandboxRules = {
  "no-restricted-imports": [
    "error",
    {
      paths: FORBIDDEN_MODULES.map((name) => ({ name, message: SANDBOX_MESSAGE })),
      patterns: [{ group: ["node:*"], message: SANDBOX_MESSAGE }],
    },
  ],
  "no-restricted-globals": [
    "error",
    ...FORBIDDEN_GLOBALS.map((name) => ({ name, message: SANDBOX_MESSAGE })),
  ],
  "no-restricted-properties": [
    "error",
    ...FORBIDDEN_GLOBALS.map((property) => ({
      object: "globalThis",
      property,
      message: SANDBOX_MESSAGE,
    })),
    { object: "process", property: "binding", message: SANDBOX_MESSAGE },
    { object: "process", property: "dlopen", message: SANDBOX_MESSAGE },
    { object: "process", property: "mainModule", message: SANDBOX_MESSAGE },
  ],
  "no-restricted-syntax": [
    "error",
    { selector: "ImportExpression", message: SANDBOX_MESSAGE },
    { selector: "CallExpression[callee.name='require']", message: SANDBOX_MESSAGE },
    { selector: "TSImportEqualsDeclaration", message: SANDBOX_MESSAGE },
  ],
  "no-eval": "error",
  "no-implied-eval": "off",
  "@typescript-eslint/no-implied-eval": "error",
  "no-new-func": "error",
};

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    // Apply to all TypeScript source files
    files: ["src/**/*.ts", "src/**/*.tsx", "scripts/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // Base TypeScript recommended rules
      ...tsPlugin.configs["recommended"].rules,

      // Stricter rules for production code quality
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],

      // General code quality
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    // Relax rules for test files
    files: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "no-console": "off",
    },
  },
  {
    // Design D12: code shared with the Cloudflare Worker must not import Node
    // built-ins or the Node server adapter. Node-only files are exempt.
    files: ["src/app.ts", "src/api/**/*.ts", "src/modules/**/*.ts", "src/content/**/*.ts"],
    ignores: [
      "src/**/*.test.ts",
      "src/**/*.spec.ts",
      "src/modules/**/file-repository.ts",
      "src/test-support/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@hono/node-server", message: WORKER_MESSAGE }],
          patterns: [
            { group: ["node:*"], message: WORKER_MESSAGE },
            { group: ["@hono/node-server/*"], message: WORKER_MESSAGE },
            { group: ["**/file-repository", "**/file-repository.js"], message: WORKER_MESSAGE },
          ],
        },
      ],
    },
  },
  {
    // Req 18.5: Simulation Runtime sandbox. Scenario transitions/state changes
    // must run with no outbound network, no filesystem access and no process
    // spawning, so the module (excluding tests) may not reach any such API.
    files: ["src/modules/simulation-runtime/**/*.ts"],
    ignores: ["src/modules/simulation-runtime/**/*.test.ts"],
    rules: sandboxRules,
  },
  {
    // Ignore build artifacts and dependencies
    ignores: ["dist/**", "node_modules/**", "coverage/**", ".next/**", "out/**", "src/frontend/**"],
  },
];

export default config;
