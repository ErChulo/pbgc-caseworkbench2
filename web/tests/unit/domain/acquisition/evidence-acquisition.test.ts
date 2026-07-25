import { describe, expect, it } from "vitest";

import {
  proposalDecisionHash,
  replayProposalDecisions,
} from "../../../../src/domain/acquisition/proposal-validator";
import type { ProposalDecisionRecord } from "../../../../src/domain/acquisition/models";
import { deterministicSha256 } from "../../../../src/domain/normalization/normalizer";
import {
  parseSha256,
  parseUtcTimestamp,
  type Sha256,
} from "../../../../src/domain/shared/types";

const proposal = sha("a".repeat(64));

describe("T102 acquisition decisions", () => {
  it("replays gapless append-only decisions independently of timestamps", async () => {
    const approved = await decision(
      null,
      "approve",
      "approved",
      "2026-02-02T00:00:00Z",
    );
    const revoked = await decision(
      approved,
      "revoke",
      "revoked",
      "2026-01-01T00:00:00Z",
    );
    expect(
      await replayProposalDecisions(proposal, [approved, revoked]),
    ).toEqual({
      ok: true,
      value: "revoked",
    });
    expect(
      (
        await replayProposalDecisions(proposal, [
          { ...approved, appendOrdinal: 2 },
        ])
      ).ok,
    ).toBe(false);
    expect(
      (
        await replayProposalDecisions(proposal, [
          approved,
          { ...revoked, priorDecisionId: "wrong" },
        ])
      ).ok,
    ).toBe(false);
  });
  it("preserves unregistered nested-array order and validates ascending priorities", async () => {
    const left = {
      deterministicProposalPayload: {
        proposedExtractedFacts: [
          { factKey: "x", value: { nested: [1, 2] }, citationIds: [] },
        ],
      },
    };
    const right = {
      deterministicProposalPayload: {
        proposedExtractedFacts: [
          { factKey: "x", value: { nested: [2, 1] }, citationIds: [] },
        ],
      },
    };
    expect(
      await deterministicSha256(left, {
        schemaId: "evidence-acquisition.schema.json",
      }),
    ).not.toBe(
      await deterministicSha256(right, {
        schemaId: "evidence-acquisition.schema.json",
      }),
    );
  });
});

async function decision(
  prior: ProposalDecisionRecord | null,
  decisionType: ProposalDecisionRecord["decisionType"],
  resultingGovernedStatus: ProposalDecisionRecord["resultingGovernedStatus"],
  time: string,
): Promise<ProposalDecisionRecord> {
  const base = {
    appendOrdinal: (prior?.appendOrdinal ?? 0) + 1,
    priorDecisionId: prior?.decisionId ?? null,
    priorDecisionContentSha256: prior?.decisionContentSha256 ?? null,
    proposalSha256: proposal,
    decisionType,
    resultingGovernedStatus,
    ruleSetVersion: "rules-v1",
    schemaVersion: "1.0.0",
  } as const;
  const parsed = parseUtcTimestamp(time);
  if (!parsed.ok) throw new Error("time");
  return {
    ...base,
    decisionId: `decision-${String(base.appendOrdinal)}`,
    decisionContentSha256: await proposalDecisionHash(base),
    humanActor: {
      actorType: "human",
      actorId: "reviewer",
      displayName: "Reviewer",
    },
    rationale: "Synthetic review.",
    decisionTimestamp: parsed.value,
  };
}

function sha(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new Error("sha");
  return parsed.value;
}
