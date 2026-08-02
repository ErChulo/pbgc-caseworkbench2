import eslint from "@eslint/js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

const forbiddenProductionGlobals = {
  fetch: "Production runtime networking is prohibited.",
  XMLHttpRequest: "Production runtime networking is prohibited.",
  WebSocket: "Production runtime networking is prohibited.",
  EventSource: "Production runtime networking is prohibited.",
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      ".agents/**",
      ".codegraph/**",
      ".specify/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "reference/**",
      "test-results/**",
    ],
  },
  eslint.configs.recommended,
  ...[
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
  ].map((config) => ({
    ...config,
    files: ["web/**/*.{ts,tsx}", "*.config.ts"],
  })),
  {
    files: ["web/src/**/*.{ts,tsx}", "web/spikes/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: currentDirectory,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-globals": [
        "error",
        ...Object.entries(forbiddenProductionGlobals).map(
          ([name, message]) => ({ name, message }),
        ),
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='navigator'][callee.property.name='sendBeacon']",
          message: "Production runtime networking is prohibited.",
        },
        {
          selector:
            "CallExpression[callee.object.name='navigator'][callee.property.name='serviceWorker']",
          message: "Service-worker registration is prohibited.",
        },
      ],
    },
  },
  {
    files: [
      "web/tests/**/*.{ts,tsx}",
      "playwright.config.ts",
      "vitest.config.ts",
      "vite.config.ts",
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: currentDirectory,
      },
    },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    files: ["web/tools/**/*.{mjs,ts}"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: currentDirectory,
      },
    },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
);
