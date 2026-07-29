/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from "vitest";

import { runArtifactPipeline } from "../../src/domain/attempts/intake-pipeline";
import { parseSha256, parseUuid } from "../../src/domain/shared/types";
import type { ArtifactRecord } from "../../src/domain/artifacts/models";

const id = (value: string) => {
  const result = parseUuid(value);
  if (!result.ok) throw new Error("fixture");
  return result.value;
};
const hash = parseSha256("a".repeat(64));
if (!hash.ok) throw new Error("fixture");
const artifact = (
  artifactId: ArtifactRecord["artifactId"],
): ArtifactRecord => ({
  artifactId,
  receiptId: id("22222222-2222-4222-8222-222222222222"),
  sha256: hash.value,
  attemptId: id("33333333-3333-4333-8333-333333333333"),
  caseId: id("44444444-4444-4444-8444-444444444444"),
  artifactRole: "submitted-file",
  signatureMediaType: null,
  processingStatus: "preserved",
  downstreamEligibility: "blocked",
  statusHistory: [],
});

describe("T055 provisional pipeline continuation", () => {
  it("continues unaffected artifacts and blocks every output pending US3", async () => {
    const artifacts = [
      artifact(id("55555555-5555-4555-8555-555555555555")),
      artifact(id("66666666-6666-4666-8666-666666666666")),
    ];
    const durableEvents: string[] = [];
    const result = await runArtifactPipeline(
      artifacts,
      async (item) => {
        if (item.artifactId === artifacts[0]?.artifactId)
          throw new Error("synthetic isolated failure");
        return [
          {
            artifactId: item.artifactId,
            stage: "preserved" as const,
            message: "Preserved.",
          },
        ];
      },
      undefined,
      async (event) => {
        durableEvents.push(`${event.artifactId}:${event.stage}`);
      },
    );
    expect(result).toMatchObject({
      status: "partial",
      downstreamBlocked: true,
      governedState: "provisional",
    });
    expect(result.events).toHaveLength(2);
    expect(durableEvents).toHaveLength(2);
  });
});
