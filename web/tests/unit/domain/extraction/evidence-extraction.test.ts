import { describe, expect, it } from "vitest";

import {
  createEvidenceExtraction,
  parseEvidenceExtraction,
  parseEvidenceExtractionPointer,
} from "../../../../src/domain/extraction/evidence-extraction";
import { parseSha256 } from "../../../../src/domain/shared/types";

const artifactSha256 = parseSha256("a".repeat(64));
if (!artifactSha256.ok) throw new Error("Invalid fixture.");

const passive = {
  parserId: "synthetic-machine-text",
  parserVersion: "1.0.0",
  status: "success" as const,
  mediaType: "text/plain",
  text: "Synthetic machine text",
  metadata: { lineCount: 1 },
  rawValues: [],
  limitations: ["Synthetic unit fixture."],
  riskIndicators: [],
};

describe("evidence extraction persistence", () => {
  it("creates and verifies immutable machine text", async () => {
    const extraction = await createEvidenceExtraction(
      artifactSha256.value,
      passive,
    );
    const parsed = await parseEvidenceExtraction(extraction);
    expect(parsed).toEqual({ ok: true, value: extraction });
    expect(extraction.machineText).toBe(passive.text);
  });

  it("rejects changed machine text under the original hash", async () => {
    const extraction = await createEvidenceExtraction(
      artifactSha256.value,
      passive,
    );
    const parsed = await parseEvidenceExtraction({
      ...extraction,
      machineText: "Changed text",
    });
    expect(parsed.ok).toBe(false);
  });

  it("validates extraction pointers", async () => {
    const extraction = await createEvidenceExtraction(
      artifactSha256.value,
      passive,
    );
    expect(
      parseEvidenceExtractionPointer({
        extractionContentSha256: extraction.extractionContentSha256,
      }).ok,
    ).toBe(true);
    expect(
      parseEvidenceExtractionPointer({ extractionContentSha256: "invalid" })
        .ok,
    ).toBe(false);
  });
});
