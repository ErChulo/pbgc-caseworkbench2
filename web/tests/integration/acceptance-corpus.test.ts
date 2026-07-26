import { describe, expect, it } from "vitest";

import { buildAcceptanceCorpusSet } from "../fixtures/generators/acceptance-corpus";

describe("T116 synthetic acceptance corpus generator", () => {
  it("creates at least 100 mixed artifacts with independent hashes", async () => {
    const corpus = await buildAcceptanceCorpusSet();
    expect(corpus.mixedArtifacts).toHaveLength(100);
    expect(
      new Set(corpus.mixedArtifacts.map((artifact) => artifact.sha256)).size,
    ).toBe(100);
    expect(
      corpus.mixedArtifacts.some((artifact) => artifact.kind === "zip"),
    ).toBe(true);
    expect(
      corpus.mixedArtifacts.some((artifact) => artifact.kind === "xlsx"),
    ).toBe(true);
    expect(
      corpus.mixedArtifacts.some((artifact) => artifact.kind === "sensitive"),
    ).toBe(true);
  });

  it("scales to a 1000-artifact 10-GB sparse corpus with independent hashes", async () => {
    const corpus = await buildAcceptanceCorpusSet();
    expect(corpus.sparseArtifacts).toHaveLength(1_000);
    expect(
      new Set(corpus.sparseArtifacts.map((artifact) => artifact.sha256)).size,
    ).toBe(1_000);
    expect(
      corpus.sparseArtifacts.reduce(
        (total, artifact) => total + artifact.sizeBytes,
        0,
      ),
    ).toBe(10 * 1024 * 1024 * 1024);
  });
});
