import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, defineProject } from "vitest/config";

const webRoot = resolve(import.meta.dirname, "web");

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  test: {
    passWithNoTests: true,
    projects: [
      defineProject({
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
          setupFiles: ["tests/setup.ts"],
        },
      }),
      defineProject({
        test: {
          name: "contract",
          environment: "node",
          include: ["tests/contract/**/*.{test,spec}.ts"],
        },
      }),
      defineProject({
        test: {
          name: "worker",
          environment: "node",
          include: ["tests/worker/**/*.{test,spec}.ts"],
        },
      }),
      defineProject({
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.{test,spec}.ts"],
        },
      }),
    ],
  },
});
