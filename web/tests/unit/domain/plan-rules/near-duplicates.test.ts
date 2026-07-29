import { describe, expect, it } from "vitest";

import {
  detectNearDuplicates,
  restatementSimilarity,
} from "../../../../src/domain/plan-rules/near-duplicates";
import type { ProvisionCandidate } from "../../../../src/domain/plan-rules/models";
import type { Sha256, Uuid } from "../../../../src/domain/shared/types";

function candidate(
  id: string,
  hash: string,
  restatement: string,
): ProvisionCandidate {
  return {
    candidateId: id as Uuid,
    artifactSha256: "a".repeat(64) as Sha256,
    artifactLocator: `text:${id}`,
    provisionIdentifier: "section-4.1",
    verbatimText: restatement,
    normalizedRestatement: restatement,
    extractedEffectiveDate: "2025-01-01",
    extractedAdoptionDate: null,
    dateExtractionConvention: "explicit",
    confidence: 0.8,
    classifierId: "test",
    classifierVersion: "1",
    ruleSetVersion: "test",
    status: "proposed",
    candidateContentSha256: hash.repeat(64) as Sha256,
  };
}

describe("near-duplicate proposals", () => {
  it("links cosmetically changed amendments without discarding either candidate", async () => {
    const candidates = [
      candidate(
        "00000000-0000-4000-8000-000000000001",
        "b",
        "Benefit equals 1.5 percent of final average compensation",
      ),
      candidate(
        "00000000-0000-4000-8000-000000000002",
        "c",
        "Benefit equals 1.5 percent of final-average compensation.",
      ),
    ];
    const relationships = await detectNearDuplicates(candidates);
    expect(candidates).toHaveLength(2);
    expect(relationships).toHaveLength(1);
    expect(relationships[0]).toMatchObject({
      fromSha256: "b".repeat(64),
      toSha256: "c".repeat(64),
      relationshipType: "near-duplicate",
      status: "proposed",
      confidence: 1,
    });
  });

  it("is deterministic regardless of input order", async () => {
    const left = candidate(
      "00000000-0000-4000-8000-000000000001",
      "b",
      "Benefit equals one percent of pay",
    );
    const right = candidate(
      "00000000-0000-4000-8000-000000000002",
      "c",
      "Benefit equals one percent of pay",
    );
    expect(await detectNearDuplicates([left, right])).toEqual(
      await detectNearDuplicates([right, left]),
    );
  });

  it("does not link materially different provisions", async () => {
    const relationships = await detectNearDuplicates([
      candidate(
        "00000000-0000-4000-8000-000000000001",
        "b",
        "Benefit equals one percent of pay",
      ),
      candidate(
        "00000000-0000-4000-8000-000000000002",
        "c",
        "Participants retire at age sixty-five",
      ),
    ]);
    expect(relationships).toEqual([]);
    expect(restatementSimilarity("one two three", "alpha beta gamma")).toBe(0);
  });
});
