import { describe, expect, it } from "vitest";

import { assembleEvidenceManifest } from "../../../../src/domain/manifests/evidence-manifest";
import { reconcileInventory } from "../../../../src/domain/manifests/reconciliation";
import { parseSha256, type Sha256 } from "../../../../src/domain/shared/types";

const hash = sha("a".repeat(64));

describe("T103 evidence manifest", () => {
  it("separates deterministic content from operational metadata", async () => {
    const base = {
      schemaVersion: "1.0.0" as const,
      producerVersion: "1",
      ruleSetVersion: "rules-v1",
      deterministicPayload: {
        snapshotId: hash,
        artifacts: [
          {
            artifactKey: "a",
            sha256: hash,
            sourceLocator: "a.txt",
            downstreamEligibility: "blocked" as const,
          },
        ],
        populationEvidenceObservations: [],
        populationCandidates: [],
        unresolvedItems: [],
        validationResults: [],
        acquisitionLineageNodes: [],
        promotedFacts: [],
      },
      reconciliationTotals: reconcileInventory(
        ["a"],
        [{ recordId: "a", category: "source-artifact" }],
        [{ recordId: "a", category: "pending-human-disposition" }],
      ),
      operationalMetadata: {
        generatedAt: "2026-01-01T00:00:00Z",
        runId: "run-1",
        proposalDecisions: [],
        populationDecisions: [],
      },
    };
    const first = await assembleEvidenceManifest(base);
    const second = await assembleEvidenceManifest({
      ...base,
      operationalMetadata: { ...base.operationalMetadata, runId: "run-2" },
    });
    expect(first.contentManifestId).toBe(second.contentManifestId);
    expect(first.operationalMetadata.runId).not.toBe(
      second.operationalMetadata.runId,
    );
  });
  it("rejects duplicate deterministic identities", async () => {
    const reconciliation = reconcileInventory(
      ["a"],
      [{ recordId: "a", category: "source-artifact" }],
      [{ recordId: "a", category: "pending-human-disposition" }],
    );
    await expect(
      assembleEvidenceManifest({
        schemaVersion: "1.0.0",
        producerVersion: "1",
        ruleSetVersion: "rules",
        deterministicPayload: {
          snapshotId: hash,
          artifacts: [
            {
              artifactKey: "a",
              sha256: hash,
              sourceLocator: "a",
              downstreamEligibility: "blocked",
            },
            {
              artifactKey: "a",
              sha256: hash,
              sourceLocator: "b",
              downstreamEligibility: "blocked",
            },
          ],
          populationEvidenceObservations: [],
          populationCandidates: [],
          unresolvedItems: [],
          validationResults: [],
          acquisitionLineageNodes: [],
          promotedFacts: [],
        },
        reconciliationTotals: reconciliation,
        operationalMetadata: {
          generatedAt: "",
          runId: "",
          proposalDecisions: [],
          populationDecisions: [],
        },
      }),
    ).rejects.toThrow(/unique/u);
  });
});

function sha(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new Error("sha");
  return parsed.value;
}
