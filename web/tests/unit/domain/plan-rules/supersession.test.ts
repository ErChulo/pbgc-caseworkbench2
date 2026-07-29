import { describe, expect, it } from "vitest";

import type { ProvisionCandidate } from "../../../../src/domain/plan-rules/models";
import { detectSupersession } from "../../../../src/domain/plan-rules/supersession";
import type { Sha256, Uuid } from "../../../../src/domain/shared/types";

function candidate(
  id: string,
  hash: string,
  effectiveDate: string | null,
  text: string,
  provisionIdentifier = "section-4.1",
): ProvisionCandidate {
  return {
    candidateId: id as Uuid,
    artifactSha256: hash.repeat(64) as Sha256,
    artifactLocator: `text:${id}`,
    provisionIdentifier,
    verbatimText: text,
    normalizedRestatement: text,
    extractedEffectiveDate: effectiveDate,
    extractedAdoptionDate: null,
    dateExtractionConvention: effectiveDate === null ? "unknown" : "explicit",
    confidence: 0.8,
    classifierId: "test",
    classifierVersion: "1",
    ruleSetVersion: "test",
    status: "proposed",
    candidateContentSha256: hash.repeat(64) as Sha256,
  };
}

describe("supersession proposals", () => {
  it("links an explicitly later replacement and preserves its effective date", async () => {
    const predecessor = candidate(
      "00000000-0000-4000-8000-000000000001",
      "b",
      "2020-01-01",
      "Benefit equals one percent of compensation.",
    );
    const successor = candidate(
      "00000000-0000-4000-8000-000000000002",
      "c",
      "2024-07-31",
      "This amendment replaces the benefit with 1.5 percent of compensation.",
    );
    const proposals = await detectSupersession([successor, predecessor]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      predecessorCandidateId: predecessor.candidateId,
      successorCandidateId: successor.candidateId,
      effectiveDate: "2024-07-31",
      relationshipType: "supersession",
      status: "proposed",
      fromSha256: predecessor.candidateContentSha256,
      toSha256: successor.candidateContentSha256,
    });
    expect(predecessor.extractedEffectiveDate).toBe("2020-01-01");
    expect(successor.extractedEffectiveDate).toBe("2024-07-31");
  });

  it("does not silently infer sequencing without two explicit effective dates", async () => {
    const proposals = await detectSupersession([
      candidate(
        "00000000-0000-4000-8000-000000000001",
        "b",
        null,
        "Benefit equals one percent.",
      ),
      candidate(
        "00000000-0000-4000-8000-000000000002",
        "c",
        "2024-01-01",
        "This amendment replaces the benefit.",
      ),
    ]);
    expect(proposals).toEqual([]);
  });

  it("does not link different provision identifiers", async () => {
    const proposals = await detectSupersession([
      candidate(
        "00000000-0000-4000-8000-000000000001",
        "b",
        "2020-01-01",
        "Benefit equals one percent.",
        "section-4.1",
      ),
      candidate(
        "00000000-0000-4000-8000-000000000002",
        "c",
        "2024-01-01",
        "This amendment replaces the benefit.",
        "section-5.2",
      ),
    ]);
    expect(proposals).toEqual([]);
  });

  it("returns the same proposed relationship independent of input order", async () => {
    const predecessor = candidate(
      "00000000-0000-4000-8000-000000000001",
      "b",
      "2020-01-01",
      "Benefit equals one percent of compensation.",
    );
    const successor = candidate(
      "00000000-0000-4000-8000-000000000002",
      "c",
      "2024-01-01",
      "Benefit equals one percent of compensation.",
    );
    expect(await detectSupersession([predecessor, successor])).toEqual(
      await detectSupersession([successor, predecessor]),
    );
  });
});
