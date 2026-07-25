/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from "vitest";

import {
  authorityDecisionContentHash,
  replayAuthorityDecisions,
  sourceRoleProposalContentHash,
} from "../../../../src/domain/classification/authority-decision";
import { classificationDecisionContentHash } from "../../../../src/domain/classification/classification-review";
import { proposeClassifications } from "../../../../src/domain/classification/classifier";
import type {
  AuthorityDecision,
  ClassificationApproval,
} from "../../../../src/domain/classification/models";
import { syntheticClassificationArtifacts } from "../../../fixtures/generators/classification";
import {
  parseUtcTimestamp,
  parseUuid,
  type Uuid,
} from "../../../../src/domain/shared/types";

const human = {
  actorType: "human" as const,
  actorKey: "authority-reviewer",
  displayName: "Synthetic Authority Reviewer",
  authorityContext: "Repository-owner delegated synthetic test",
};
const timestamp = parseUtcTimestamp("2026-07-25T12:00:00.000Z");
if (!timestamp.ok) throw new Error("fixture");
const uuid = (value: string): Uuid => {
  const parsed = parseUuid(value);
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
};

describe("T077 separate AuthorityDecision governance", () => {
  it("requires separate current same-byte classification approval and invalidates authority when approval changes", async () => {
    const proposal = (
      await proposeClassifications(syntheticClassificationArtifacts()[0]!)
    ).find((item) => item.proposedValue === "authority-candidate");
    if (!proposal) throw new Error("fixture");
    const approvalBase = {
      approvalId: uuid("11111111-1111-4111-8111-111111111111"),
      appendOrdinal: 1,
      priorApprovalId: null,
      priorApprovalContentSha256: null,
      proposalKey: proposal.proposalKey,
      artifactSha256: proposal.artifactSha256,
      decisionType: "approve" as const,
      status: "approved" as const,
      actor: human,
      decidedAt: timestamp.value,
      rationale: "Source role reviewed.",
      ruleSetVersion: "1",
      schemaVersion: "1.0.0" as const,
    };
    const approval: ClassificationApproval = {
      ...approvalBase,
      decisionContentSha256:
        await classificationDecisionContentHash(approvalBase),
    };
    const proposalHash = await sourceRoleProposalContentHash(proposal);
    const authorityBase = {
      authorityDecisionId: uuid("22222222-2222-4222-8222-222222222222"),
      appendOrdinal: 1,
      priorDecisionId: null,
      priorDecisionContentSha256: null,
      sourceRoleProposalId: proposal.proposalKey,
      sourceRoleProposalContentSha256: proposalHash,
      classificationApprovalId: approval.approvalId,
      classificationApprovalContentSha256: approval.decisionContentSha256,
      artifactSha256: proposal.artifactSha256,
      sourceRoleProposalArtifactSha256: proposal.artifactSha256,
      classificationApprovalArtifactSha256: proposal.artifactSha256,
      approver: human,
      decision: "approved" as const,
      decisionTimestamp: timestamp.value,
      rationale: "Separate authority designation.",
      ruleSetVersion: "1",
      schemaVersion: "1.0.0" as const,
    };
    const authority: AuthorityDecision = {
      ...authorityBase,
      decisionContentSha256: await authorityDecisionContentHash(authorityBase),
    };
    expect(
      await replayAuthorityDecisions(proposal, [approval], [authority]),
    ).toMatchObject({
      ok: true,
      value: { authoritative: true, status: "approved" },
    });

    const revokeBase = {
      ...approvalBase,
      approvalId: uuid("33333333-3333-4333-8333-333333333333"),
      appendOrdinal: 2,
      priorApprovalId: approval.approvalId,
      priorApprovalContentSha256: approval.decisionContentSha256,
      decisionType: "revoke" as const,
      status: "revoked" as const,
    };
    const revoke: ClassificationApproval = {
      ...revokeBase,
      decisionContentSha256:
        await classificationDecisionContentHash(revokeBase),
    };
    expect(
      await replayAuthorityDecisions(proposal, [approval, revoke], [authority]),
    ).toMatchObject({
      ok: false,
      error: { code: "INEFFECTIVE_APPROVAL" },
    });
    expect(
      await replayAuthorityDecisions(
        {
          ...proposal,
          artifactSha256: syntheticClassificationArtifacts()[2]!.sha256,
        },
        [approval],
        [authority],
      ),
    ).toMatchObject({ ok: false });
  });

  it("rejects system authority actors and missing approval linkage", async () => {
    const proposal = (
      await proposeClassifications(syntheticClassificationArtifacts()[0]!)
    ).find((item) => item.proposedValue === "authority-candidate");
    if (!proposal) throw new Error("fixture");
    expect(await replayAuthorityDecisions(proposal, [], [])).toMatchObject({
      ok: false,
      error: { code: "INEFFECTIVE_APPROVAL" },
    });
  });
});
