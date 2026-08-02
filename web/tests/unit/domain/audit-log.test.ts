import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  invalidAuditHistories,
  validAuditHistory,
} from "../../fixtures/contracts/audit-events";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

interface AuditApi {
  encodeAuditJsonl(events: readonly unknown[]): string;
  decodeAuditJsonl(input: string): {
    readonly events: readonly unknown[];
    readonly truncatedFinalLine: boolean;
  };
  validateAuditHistory(events: readonly unknown[]): {
    readonly valid: boolean;
    readonly issues: readonly { readonly code: string }[];
  };
}

async function loadAuditApi(): Promise<AuditApi> {
  const implementationUrl = pathToFileURL(
    resolve(currentDirectory, "../../../src/domain/lineage/audit-log.ts"),
  ).href;
  return (await import(/* @vite-ignore */ implementationUrl)) as AuditApi;
}

describe("T016 append-only JSONL audit history (red until T022)", () => {
  it("round-trips valid append-only events without losing prior history", async () => {
    const api = await loadAuditApi();
    const encoded = api.encodeAuditJsonl(validAuditHistory);
    const decoded = api.decodeAuditJsonl(encoded);
    expect(decoded.events).toEqual(validAuditHistory);
    expect(decoded.truncatedFinalLine).toBe(false);
    expect(api.validateAuditHistory(decoded.events).valid).toBe(true);
  });

  it("retains complete records and reports a truncated final line", async () => {
    const api = await loadAuditApi();
    const encoded = api.encodeAuditJsonl(validAuditHistory);
    const truncated = encoded.slice(0, encoded.lastIndexOf("\n") - 12);
    const decoded = api.decodeAuditJsonl(truncated);
    expect(decoded.events).toEqual([validAuditHistory[0]]);
    expect(decoded.truncatedFinalLine).toBe(true);
  });

  it.each(invalidAuditHistories)(
    "rejects $name without deleting prior events",
    async ({ events, expectedCode }) => {
      const api = await loadAuditApi();
      const snapshot = structuredClone(events);
      const result = api.validateAuditHistory(events);
      expect(result.valid).toBe(false);
      expect(result.issues.map(({ code }) => code)).toContain(expectedCode);
      expect(events).toEqual(snapshot);
    },
  );
});
