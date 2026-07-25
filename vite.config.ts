import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const renameEntryHtml = {
  name: "rename-entry-html",
  enforce: "post" as const,
  generateBundle(
    _options: unknown,
    bundle: Record<string, { fileName: string }>,
  ) {
    const entry = Object.values(bundle).find(
      (item) => item.fileName === "index.html",
    );
    if (entry) entry.fileName = "pbgc-caseworkbench.html";
  },
};

export default defineConfig({
  root: resolve(import.meta.dirname, "web"),
  base: "./",
  plugins: [react(), viteSingleFile(), renameEntryHtml],
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
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
