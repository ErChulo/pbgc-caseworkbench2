/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from "vitest";

import {
  discoverSubmittedFiles,
  sourceRemainsUnchanged,
} from "../../../../src/adapters/filesystem/package-discovery";
import { parseUtcTimestamp } from "../../../../src/domain/shared/types";
import { readerFromBytes } from "../../../fixtures/generators/artifacts";

const now = parseUtcTimestamp("2026-07-25T18:00:00.000Z");
if (!now.ok) throw new Error("fixture");
const source = (
  path: string,
  sizeBytes = 3,
  lastModified: number | null = 1,
) => ({
  observedRelativePath: path,
  fileName: path.split("/").at(-1) ?? path,
  sizeBytes,
  lastModified,
  declaredMediaType: null,
  open: async () => readerFromBytes(new Uint8Array(sizeBytes)),
});

describe("T050 deterministic package discovery", () => {
  it("sorts stable paths, preserves Unicode, and detects mutation", () => {
    const discovered = discoverSubmittedFiles(
      [source("z.txt"), source("café.txt")],
      now.value,
    );
    expect(discovered.map((item) => item.normalizedDisplayPath)).toEqual([
      "café.txt",
      "z.txt",
    ]);
    const first = discovered[0];
    if (first === undefined) throw new Error("fixture");
    expect(sourceRemainsUnchanged(first, source("café.txt"))).toBe(true);
    expect(sourceRemainsUnchanged(first, source("café.txt", 4))).toBe(false);
  });

  it.each(["../escape", "/absolute", "a//b", "a\u0000b"])(
    "rejects unsafe path %j",
    (path) => {
      expect(() => discoverSubmittedFiles([source(path)], now.value)).toThrow(
        /unsafe/u,
      );
    },
  );

  it("rejects paths colliding after NFC normalization", () => {
    expect(() =>
      discoverSubmittedFiles(
        [source("café.txt"), source("cafe\u0301.txt")],
        now.value,
      ),
    ).toThrow(/Duplicate/u);
  });
});
