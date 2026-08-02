import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  prohibitedExternalAssetUrls,
  prohibitedNetworkCapabilities,
} from "../../fixtures/contracts/network-boundary-cases";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

interface SecurityBoundaryApi {
  installProductionSecurityBoundary(scope: Record<string, unknown>): void;
  assertLocalAssetUrl(url: string): void;
  assertLocalWorkerUrl(url: string): void;
}

async function loadSecurityBoundary(): Promise<SecurityBoundaryApi> {
  const implementationUrl = pathToFileURL(
    resolve(currentDirectory, "../../../src/app/security-boundary.ts"),
  ).href;
  return (await import(
    /* @vite-ignore */ implementationUrl
  )) as SecurityBoundaryApi;
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if ([".ts", ".tsx", ".html", ".css"].includes(extname(path))) {
      files.push(path);
    }
  }
  return files;
}

describe("T017 production zero-network boundary (red until T028)", () => {
  it("contains no external HTTP(S) asset URL in production source", async () => {
    const files = await sourceFiles(resolve(currentDirectory, "../../../src"));
    files.push(resolve(currentDirectory, "../../../index.html"));
    for (const file of files) {
      const content = await readFile(file, "utf8");
      expect(content, file).not.toMatch(/\bhttps?:\/\//u);
    }
  });

  it.each(prohibitedNetworkCapabilities)(
    "disables %s in the production runtime",
    async (capability) => {
      const api = await loadSecurityBoundary();
      const calls: string[] = [];
      const scope = {
        fetch: () => {
          calls.push("fetch");
        },
        XMLHttpRequest: () => undefined,
        WebSocket: () => undefined,
        EventSource: () => undefined,
        navigator: {
          sendBeacon: () => {
            calls.push("sendBeacon");
          },
          serviceWorker: {
            register: () => {
              calls.push("serviceWorker");
            },
          },
        },
      };
      api.installProductionSecurityBoundary(scope);
      expect(() => {
        if (capability === "remote Worker") {
          api.assertLocalWorkerUrl("https://example.invalid/worker.js");
          return;
        }
        const path = capability.split(".");
        let value: unknown = scope;
        for (const segment of path) {
          value = (value as Record<string, unknown>)[segment];
        }
        if (typeof value === "function") {
          Reflect.apply(value, scope, []);
        }
      }).toThrow(/network|prohibited|disabled/iu);
      expect(calls).toEqual([]);
    },
  );

  it.each(prohibitedExternalAssetUrls)(
    "rejects external asset URL %s",
    async (url) => {
      const api = await loadSecurityBoundary();
      expect(() => {
        api.assertLocalAssetUrl(url);
      }).toThrow(/external|network|local/iu);
    },
  );

  it("rejects remote workers", async () => {
    const api = await loadSecurityBoundary();
    expect(() => {
      api.assertLocalWorkerUrl("https://example.invalid/worker.js");
    }).toThrow(/external|network|local/iu);
  });
});
