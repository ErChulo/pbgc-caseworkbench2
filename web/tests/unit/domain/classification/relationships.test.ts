/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from "vitest";

import {
  createRelationshipProposal,
  relationshipDecisionContentHash,
  replayRelationshipDecisions,
} from "../../../../src/domain/classification/relationship-service";
import { proposeNearDuplicate } from "../../../../src/domain/classification/near-duplicates";
import type { RelationshipDecision } from "../../../../src/domain/classification/models";
import { syntheticClassificationArtifacts } from "../../../fixtures/generators/classification";
import {
  parseUtcTimestamp,
  parseUuid,
  type Uuid,
} from "../../../../src/domain/shared/types";

const artifacts = syntheticClassificationArtifacts();
const human = {
  actorType: "human" as const,
  actorKey: "reviewer",
  displayName: "Synthetic Reviewer",
  authorityContext: "Feature 009 synthetic test",
};
const time = parseUtcTimestamp("2026-07-25T12:00:00.000Z");
if (!time.ok) throw new Error("fixture");
const uuid = (value: string): Uuid => {
  const parsed = parseUuid(value);
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
};

describe("T078 relationship proposals and governed replay", () => {
  it("keeps exact identity cryptographic and near-duplicate similarity proposed", async () => {
    const near = await proposeNearDuplicate(
      artifacts[0]!.sha256,
      artifacts[2]!.sha256,
      artifacts[0]!.text,
      artifacts[2]!.text,
      0.2,
    );
    expect(near).toMatchObject({
      relationshipType: "near-duplicate",
      status: "proposed",
    });
    expect(
      await proposeNearDuplicate(
        artifacts[0]!.sha256,
        artifacts[0]!.sha256,
        "same",
        "same",
      ),
    ).toBeNull();
  });

  it.each([
    "authority",
    "amendment",
    "supersession",
    "replacement",
    "conflict",
    "effective-period",
  ] as const)(
    "creates %s only as a directional proposal",
    async (relationshipType) => {
      const proposal = await createRelationshipProposal({
        fromSha256: artifacts[0]!.sha256,
        toSha256: artifacts[3]!.sha256,
        relationshipType,
        status: "proposed",
        confidence: 0.75,
        supportingEvidence: [],
        ruleSetVersion: "1",
      });
      expect(proposal.status).toBe("proposed");
      expect(proposal.fromSha256).not.toBe(proposal.toSha256);
    },
  );

  it("derives approval from a valid human chain without mutating source evidence", async () => {
    const proposal = await createRelationshipProposal({
      fromSha256: artifacts[0]!.sha256,
      toSha256: artifacts[3]!.sha256,
      relationshipType: "amendment",
      status: "proposed",
      confidence: 0.7,
      supportingEvidence: [],
      ruleSetVersion: "1",
    });
    const base = {
      decisionId: uuid("11111111-1111-4111-8111-111111111111"),
      appendOrdinal: 1,
      priorDecisionId: null,
      priorDecisionContentSha256: null,
      relationshipKey: proposal.relationshipKey,
      fromSha256: proposal.fromSha256,
      toSha256: proposal.toSha256,
      decisionType: "approve" as const,
      actor: human,
      decidedAt: time.value,
      rationale: "Synthetic evidence reviewed.",
      evidenceConsidered: [],
      resultingGovernedStatus: "approved" as const,
      ruleSetVersion: "1",
      schemaVersion: "1.0.0" as const,
    };
    const decision: RelationshipDecision = {
      ...base,
      decisionContentSha256: await relationshipDecisionContentHash(base),
    };
    expect(
      await replayRelationshipDecisions(proposal, [decision]),
    ).toMatchObject({
      ok: true,
      value: { status: "approved" },
    });
    expect(proposal.status).toBe("proposed");
    expect(
      await replayRelationshipDecisions(proposal, [decision], false),
    ).toMatchObject({
      ok: false,
      error: { code: "INCOMPLETE_CONTEXT" },
    });
    expect(
      await replayRelationshipDecisions(proposal, [
        { ...decision, toSha256: artifacts[4]!.sha256 },
      ]),
    ).toMatchObject({ ok: false, error: { code: "MISMATCHED_SUBJECT" } });
    expect(
      await replayRelationshipDecisions(proposal, [
        { ...decision, actor: { ...human, actorType: "system" as never } },
      ]),
    ).toMatchObject({ ok: false, error: { code: "INVALID_ACTOR" } });
    expect(
      await replayRelationshipDecisions(proposal, [
        { ...decision, decisionContentSha256: artifacts[4]!.sha256 },
      ]),
    ).toMatchObject({ ok: false, error: { code: "INVALID_HASH" } });
    expect(
      await replayRelationshipDecisions(proposal, [
        { ...decision, appendOrdinal: 2 },
      ]),
    ).toMatchObject({ ok: false, error: { code: "INVALID_CHAIN" } });
  });
});
