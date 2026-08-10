import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const renameEntryHtml = {
  name: "rename-entry-html",
  enforce: "post" as const,
  generateBundle(
    _options: unknown,
    bundle: Record<
      string,
      {
        fileName: string;
        type: "asset" | "chunk";
        source?: string | Uint8Array;
      }
    >,
  ) {
    const entry = Object.values(bundle).find(
      (item) => item.fileName === "index.html",
    );
    if (entry) {
      entry.fileName = "pbgc-caseworkbench.html";
      if (entry.type === "asset" && typeof entry.source === "string") {
        entry.source = entry.source.replace(/\r\n?/gu, "\n");
      }
    }
  },
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(currentDirectory, "web"),
  base: "./",
  plugins: [react(), viteSingleFile(), renameEntryHtml],
  build: {
    outDir: resolve(currentDirectory, "dist"),
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  worker: {
    format: "es",
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
});
