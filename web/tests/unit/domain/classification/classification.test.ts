/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from "vitest";

import { proposeClassifications } from "../../../../src/domain/classification/classifier";
import {
  classificationDecisionContentHash,
  replayClassificationApprovals,
  reusableApprovedClassification,
} from "../../../../src/domain/classification/classification-review";
import type { ClassificationApproval } from "../../../../src/domain/classification/models";
import { syntheticClassificationArtifacts } from "../../../fixtures/generators/classification";
import {
  parseUtcTimestamp,
  parseUuid,
  type Uuid,
} from "../../../../src/domain/shared/types";
import { evaluateProductionGate } from "../../../../src/domain/classification/production-gate";

const artifact = syntheticClassificationArtifacts()[0]!;
const human = {
  actorType: "human" as const,
  actorKey: "reviewer",
  displayName: "Synthetic Reviewer",
  authorityContext: "Feature 009 synthetic test",
};
const time = (() => {
  const parsed = parseUtcTimestamp("2026-07-25T12:00:00.000Z");
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
})();
const uuid = (value: string): Uuid => {
  const parsed = parseUuid(value);
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
};

async function decision(
  proposal: Awaited<ReturnType<typeof proposeClassifications>>[number],
  input: Pick<
    ClassificationApproval,
    | "approvalId"
    | "appendOrdinal"
    | "priorApprovalId"
    | "priorApprovalContentSha256"
    | "decisionType"
    | "status"
  >,
): Promise<ClassificationApproval> {
  const base = {
    ...input,
    proposalKey: proposal.proposalKey,
    artifactSha256: proposal.artifactSha256,
    actor: human,
    decidedAt: time,
    rationale: "Synthetic review.",
    ruleSetVersion: "1",
    schemaVersion: "1.0.0" as const,
  };
  return {
    ...base,
    decisionContentSha256: await classificationDecisionContentHash(base),
  };
}

describe("T077 classification proposals and replay", () => {
  it("creates immutable proposal-only category and source-role results", async () => {
    const proposals = await proposeClassifications(artifact);
    expect(proposals.map((item) => item.dimension)).toEqual(
      expect.arrayContaining(["document-category", "source-role"]),
    );
    expect(
      proposals.every((item) =>
        ["proposed", "unresolved"].includes(item.status),
      ),
    ).toBe(true);
    expect(
      proposals.find((item) => item.proposedValue === "executed-plan-document"),
    ).toMatchObject({
      authorityCandidate: true,
      status: "proposed",
    });
    expect(
      proposals
        .filter((item) => item.dimension === "source-role")
        .map((item) => item.proposedValue),
    ).toEqual(["executed-plan-document"]);
    expect(Object.isFrozen(proposals[0])).toBe(true);
  });

  it("binds otherwise identical proposals to the exact analyzed text", async () => {
    const original = await proposeClassifications(artifact);
    const corrected = await proposeClassifications({
      ...artifact,
      text: `${artifact.text} Corrected locally.`,
      analysisSourceLocator: "correction:synthetic",
    });
    const originalPlan = original.find(
      (item) => item.proposedValue === "plan-document",
    );
    const correctedPlan = corrected.find(
      (item) => item.proposedValue === "plan-document",
    );
    expect(originalPlan?.proposalKey).not.toBe(correctedPlan?.proposalKey);
    expect(correctedPlan?.supportingEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceType: "metadata",
          sourceLocator: "correction:synthetic",
        }),
      ]),
    );
  });

  it("binds page-scoped proposals to an exact PDF page locator", async () => {
    const proposals = await proposeClassifications({
      ...artifact,
      text: "Executed plan document",
      textLocator: "pdf:page=4",
    });
    expect(
      proposals.flatMap((proposal) => proposal.supportingEvidence),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceLocator: "pdf:page=4" }),
      ]),
    );
  });

  it("computes human approval without mutating the proposal and ignores timestamps for replay order", async () => {
    const proposal = (await proposeClassifications(artifact))[0]!;
    const frozen = JSON.stringify(proposal);
    const approved = await decision(proposal, {
      approvalId: uuid("11111111-1111-4111-8111-111111111111"),
      appendOrdinal: 1,
      priorApprovalId: null,
      priorApprovalContentSha256: null,
      decisionType: "approve",
      status: "approved",
    });
    expect(
      await replayClassificationApprovals(proposal, [approved]),
    ).toMatchObject({
      ok: true,
      value: { status: "approved" },
    });
    expect(JSON.stringify(proposal)).toBe(frozen);
    expect(
      await replayClassificationApprovals(proposal, [
        { ...approved, actor: { ...human, actorType: "system" as never } },
      ]),
    ).toMatchObject({ ok: false, error: { code: "INVALID_ACTOR" } });
  });

  it("allows traceable classification reuse only for exact matching hashes", async () => {
    const proposal = (await proposeClassifications(artifact))[0]!;
    const approved = await decision(proposal, {
      approvalId: uuid("11111111-1111-4111-8111-111111111111"),
      appendOrdinal: 1,
      priorApprovalId: null,
      priorApprovalContentSha256: null,
      decisionType: "approve",
      status: "approved",
    });
    expect(
      await reusableApprovedClassification(proposal, [approved], {
        ...proposal,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await reusableApprovedClassification(proposal, [approved], {
        ...proposal,
        artifactSha256: syntheticClassificationArtifacts()[2]!.sha256,
      }),
    ).toMatchObject({ ok: false, error: { code: "MISMATCHED_ARTIFACT" } });
  });

  it("blocks production until human classification and separate authority are effective", () => {
    expect(
      evaluateProductionGate({
        artifactSha256: artifact.sha256,
        classification: {
          status: "provisional",
          effectiveDecisionId: null,
          provenance: [],
        },
        authorityRequired: false,
      }),
    ).toMatchObject({ ok: false });
    expect(
      evaluateProductionGate({
        artifactSha256: artifact.sha256,
        classification: {
          status: "approved",
          effectiveDecisionId: uuid("11111111-1111-4111-8111-111111111111"),
          provenance: [uuid("11111111-1111-4111-8111-111111111111")],
        },
        authorityRequired: true,
      }),
    ).toMatchObject({ ok: false });
  });
});
