import { describe, expect, it } from "vitest";

import {
  createEvidenceTextCorrection,
  parseEvidenceCorrectionPointer,
  parseEvidenceTextCorrection,
} from "../../../../src/domain/extraction/evidence-correction";
import {
  parseSha256,
  parseUtcTimestamp,
} from "../../../../src/domain/shared/types";

const artifactSha256 = parseSha256("a".repeat(64));
const extractionContentSha256 = parseSha256("b".repeat(64));
const correctedAt = parseUtcTimestamp("2026-08-09T10:00:00.000Z");
if (!artifactSha256.ok || !extractionContentSha256.ok || !correctedAt.ok) {
  throw new Error("Invalid fixture.");
}

describe("evidence text correction persistence", () => {
  it("keeps corrected text bound to the exact machine extraction", async () => {
    const correction = await createEvidenceTextCorrection({
      schemaVersion: "1.0.0",
      artifactSha256: artifactSha256.value,
      extractionContentSha256: extractionContentSha256.value,
      correctedText: "Human-corrected synthetic text",
      correctedBy: "Synthetic Reviewer",
      correctedAt: correctedAt.value,
    });
    await expect(parseEvidenceTextCorrection(correction)).resolves.toEqual({
      ok: true,
      value: correction,
    });
    expect(
      parseEvidenceCorrectionPointer({
        correctionContentSha256: correction.correctionContentSha256,
      }).ok,
    ).toBe(true);
  });

  it("rejects changed corrected text under the original hash", async () => {
    const correction = await createEvidenceTextCorrection({
      schemaVersion: "1.0.0",
      artifactSha256: artifactSha256.value,
      extractionContentSha256: extractionContentSha256.value,
      correctedText: "Original correction",
      correctedBy: "Synthetic Reviewer",
      correctedAt: correctedAt.value,
    });
    const parsed = await parseEvidenceTextCorrection({
      ...correction,
      correctedText: "Tampered correction",
    });
    expect(parsed.ok).toBe(false);
  });
});
