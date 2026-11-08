import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build } from "vite";
import { expect, it } from "vitest";
import { rejectBrowserBuiltins } from "../../tools/reject-browser-builtins";
import { fileURLToPath } from "node:url";
import { loadFieldNameGlossary } from "../../src/adapters/node/architecture-rule-files";

it.each([
  [
    "static node-prefixed",
    'import { readFile } from "node:fs/promises"; globalThis.fixture = readFile;',
  ],
  [
    "dynamic node-prefixed",
    'globalThis.fixture = () => import("node:fs/promises");',
  ],
  ["bare builtin", 'import * as fs from "fs"; globalThis.fixture = fs;'],
])(
  "rejects %s builtin in a browser build instead of silently creating a stub",
  async (_name, code) => {
    const root = await mkdtemp(resolve(tmpdir(), "pbgc-browser-boundary-"));
    try {
      await writeFile(resolve(root, "main.js"), code);
      await expect(
        build({
          configFile: false,
          root,
          logLevel: "silent",
          plugins: [rejectBrowserBuiltins()],
          build: {
            write: false,
            rollupOptions: {
              input: resolve(root, "main.js"),
            },
          },
        }),
      ).rejects.toThrow(/Browser build cannot import Node builtin/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

it("loads a glossary for Node tooling and fails closed for a missing file", async () => {
  const loaded = await loadFieldNameGlossary(
    fileURLToPath(
      new URL("../../../rules/field-name-glossary.yaml", import.meta.url),
    ),
  );
  expect(loaded.ok).toBe(true);
  const missing = await loadFieldNameGlossary(
    resolve(tmpdir(), "pbgc-nonexistent-glossary", "missing.yaml"),
  );
  expect(missing).toMatchObject({
    ok: false,
    error: { code: "RULE_FILE_NOT_FOUND" },
  });
});
