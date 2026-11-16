import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist", "src/frontend"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/types/**",
        "src/frontend/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@modules": resolve(__dirname, "src/modules"),
      "@api": resolve(__dirname, "src/api"),
      "@types": resolve(__dirname, "src/types"),
    },
  },
});
