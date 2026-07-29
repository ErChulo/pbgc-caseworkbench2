import { describe, expect, it } from "vitest";

import {
  runArtifactPipeline,
  runScreenedArtifactPipeline,
} from "../../src/domain/attempts/intake-pipeline";
import { runScreening } from "../../src/domain/quarantine/screening-service";
import type { ArtifactRecord } from "../../src/domain/artifacts/models";
import { parseSha256, parseUuid } from "../../src/domain/shared/types";

const uuid = (value: string) => {
  const parsed = parseUuid(value);
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
};
const hash = parseSha256("a".repeat(64));
if (!hash.ok) throw new Error("fixture");
const artifact = (id: string): ArtifactRecord => ({
  artifactId: uuid(id),
  receiptId: uuid("22222222-2222-4222-8222-222222222222"),
  sha256: hash.value,
  attemptId: uuid("33333333-3333-4333-8333-333333333333"),
  caseId: uuid("44444444-4444-4444-8444-444444444444"),
  artifactRole: "submitted-file",
  signatureMediaType: null,
  processingStatus: "screening",
  downstreamEligibility: "blocked",
  statusHistory: [],
});

describe("T062 artifact-level quarantine continuation", () => {
  it("continues clean siblings while the affected artifact and derivatives stay blocked", async () => {
    const first = artifact("55555555-5555-4555-8555-555555555555");
    const second = artifact("66666666-6666-4666-8666-666666666666");
    const result = await runArtifactPipeline([first, second], async (item) => {
      const screening = await runScreening(item.sha256, [
        {
          checkId: "synthetic-check",
          run: () =>
            Promise.resolve(
              item.artifactId === first.artifactId
                ? [
                    {
                      findingId: "synthetic-block",
                      artifactSha256: item.sha256,
                      ruleId: "synthetic-check",
                      ruleVersion: "1",
                      category: "secret" as const,
                      outcome: "blocked" as const,
                      severity: "critical" as const,
                      evidence: ["synthetic pattern"],
                      limitations: [],
                      blocksDownstream: true,
                    },
                  ]
                : [],
            ),
        },
      ]);
      return [
        {
          artifactId: item.artifactId,
          stage: "screened" as const,
          message:
            screening.provisionalState === "provisional-safety-block"
              ? "Provisionally blocked."
              : "Screened; human disposition remains pending.",
        },
      ];
    });
    expect(result.status).toBe("completed");
    expect(result.events).toHaveLength(2);
    expect(result).toMatchObject({
      governedState: "provisional",
      downstreamBlocked: true,
    });
  });

  it("runs minimum screening before passive extraction and skips only the blocked artifact", async () => {
    const first = artifact("55555555-5555-4555-8555-555555555555");
    const second = artifact("66666666-6666-4666-8666-666666666666");
    const inspected: string[] = [];
    const outcomes = await runScreenedArtifactPipeline(
      [first, second],
      (item) =>
        Promise.resolve({
          artifactSha256: item.sha256,
          findings: [],
          provisionalState:
            item.artifactId === first.artifactId
              ? "provisional-safety-block"
              : "screening-pending",
          downstreamBlocked: true,
          ruleSetVersion: "1",
        }),
      (item) => {
        inspected.push(item.artifactId);
        return Promise.resolve();
      },
    );
    expect(inspected).toEqual([second.artifactId]);
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]?.downstreamBlocked).toBe(true);
    expect(outcomes[1]?.downstreamBlocked).toBe(true);
  });
});
