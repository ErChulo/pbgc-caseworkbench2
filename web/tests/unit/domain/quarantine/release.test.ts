import { describe, expect, it } from "vitest";

import {
  artifactEligibilityContentHash,
  quarantineDecisionContentHash,
  replayArtifactEligibility,
  replayQuarantineDecisions,
} from "../../../../src/domain/quarantine/release-service";
import type {
  ArtifactEligibilityDecision,
  QuarantineDecision,
} from "../../../../src/domain/quarantine/models";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Sha256,
  type Uuid,
} from "../../../../src/domain/shared/types";

const sha = (character: string): Sha256 => {
  const value = parseSha256(character.repeat(64));
  if (!value.ok) throw new Error("fixture");
  return value.value;
};
const uuid = (value: string): Uuid => {
  const parsed = parseUuid(value);
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
};
const timestamp = (() => {
  const parsed = parseUtcTimestamp("2026-07-25T12:00:00.000Z");
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
})();
const human = {
  actorType: "human" as const,
  actorKey: "reviewer-1",
  displayName: "Authorized Reviewer",
  authorityContext: "Synthetic test authority",
};

async function quarantine(
  input: Omit<
    QuarantineDecision,
    "decisionContentSha256" | "reviewer" | "decidedAt" | "rationale"
  >,
): Promise<QuarantineDecision> {
  const base = {
    ...input,
    reviewer: human,
    decidedAt: timestamp,
    rationale: "Synthetic governed decision.",
  };
  return {
    ...base,
    decisionContentSha256: await quarantineDecisionContentHash(base),
  };
}

async function eligibility(
  input: Omit<
    ArtifactEligibilityDecision,
    "decisionContentSha256" | "actor" | "decidedAt" | "rationale"
  >,
): Promise<ArtifactEligibilityDecision> {
  const base = {
    ...input,
    actor: human,
    decidedAt: timestamp,
    rationale: "Synthetic eligibility decision.",
  };
  return {
    ...base,
    decisionContentSha256: await artifactEligibilityContentHash(base),
  };
}

describe("T061 exact-byte human release governance", () => {
  it("derives release without mutating proposal-only artifact source state", async () => {
    const artifact = Object.freeze({
      sha256: sha("a"),
      downstreamEligibility: "blocked" as const,
    });
    const release = await quarantine({
      decisionId: uuid("11111111-1111-4111-8111-111111111111"),
      appendOrdinal: 1,
      priorDecisionId: null,
      priorDecisionContentSha256: null,
      artifactSha256: artifact.sha256,
      findingIds: ["finding-1"],
      action: "release",
      resultingStatus: "released",
      ruleSetVersion: "1",
      schemaVersion: "1.0.0",
    });
    const result = await replayQuarantineDecisions(artifact.sha256, [release]);
    expect(result).toMatchObject({
      ok: true,
      value: { eligible: true, effectiveStatus: "released" },
    });
    expect(artifact.downstreamEligibility).toBe("blocked");
  });

  it("rejects stale hashes, changed bytes, gaps, and system-authored final decisions", async () => {
    const release = await quarantine({
      decisionId: uuid("11111111-1111-4111-8111-111111111111"),
      appendOrdinal: 1,
      priorDecisionId: null,
      priorDecisionContentSha256: null,
      artifactSha256: sha("a"),
      findingIds: [],
      action: "release",
      resultingStatus: "released",
      ruleSetVersion: "1",
      schemaVersion: "1.0.0",
    });
    expect(await replayQuarantineDecisions(sha("b"), [release])).toMatchObject({
      ok: false,
      error: { code: "MISMATCHED_ARTIFACT" },
    });
    expect(
      await replayQuarantineDecisions(sha("a"), [
        { ...release, appendOrdinal: 2 },
      ]),
    ).toMatchObject({ ok: false, error: { code: "INVALID_CHAIN" } });
    expect(
      await replayQuarantineDecisions(sha("a"), [
        {
          ...release,
          reviewer: { ...human, actorType: "system" as never },
        },
      ]),
    ).toMatchObject({ ok: false, error: { code: "INVALID_ACTOR" } });
  });

  it("supports gapless release then revocation and rejects broken predecessors", async () => {
    const release = await quarantine({
      decisionId: uuid("11111111-1111-4111-8111-111111111111"),
      appendOrdinal: 1,
      priorDecisionId: null,
      priorDecisionContentSha256: null,
      artifactSha256: sha("a"),
      findingIds: [],
      action: "release",
      resultingStatus: "released",
      ruleSetVersion: "1",
      schemaVersion: "1.0.0",
    });
    const revoke = await quarantine({
      decisionId: uuid("22222222-2222-4222-8222-222222222222"),
      appendOrdinal: 2,
      priorDecisionId: release.decisionId,
      priorDecisionContentSha256: release.decisionContentSha256,
      artifactSha256: sha("a"),
      findingIds: [],
      action: "revoke",
      resultingStatus: "revoked",
      ruleSetVersion: "1",
      schemaVersion: "1.0.0",
    });
    expect(
      await replayQuarantineDecisions(sha("a"), [release, revoke]),
    ).toMatchObject({
      ok: true,
      value: { eligible: false, effectiveStatus: "revoked" },
    });
    expect(
      await replayQuarantineDecisions(sha("a"), [
        release,
        { ...revoke, priorDecisionId: null },
      ]),
    ).toMatchObject({ ok: false, error: { code: "INVALID_CHAIN" } });
  });

  it("permits explicit same-byte inherited release only after an effective release", async () => {
    const release = await quarantine({
      decisionId: uuid("11111111-1111-4111-8111-111111111111"),
      appendOrdinal: 1,
      priorDecisionId: null,
      priorDecisionContentSha256: null,
      artifactSha256: sha("a"),
      findingIds: [],
      action: "release",
      resultingStatus: "released",
      ruleSetVersion: "1",
      schemaVersion: "1.0.0",
    });
    const inherited = await quarantine({
      decisionId: uuid("44444444-4444-4444-8444-444444444444"),
      appendOrdinal: 2,
      priorDecisionId: release.decisionId,
      priorDecisionContentSha256: release.decisionContentSha256,
      artifactSha256: sha("a"),
      findingIds: [],
      action: "inherit-release",
      resultingStatus: "released",
      ruleSetVersion: "1",
      schemaVersion: "1.0.0",
    });
    expect(
      await replayQuarantineDecisions(sha("a"), [release, inherited]),
    ).toMatchObject({ ok: true, value: { eligible: true } });
    expect(
      await replayQuarantineDecisions(sha("a"), [inherited]),
    ).toMatchObject({ ok: false });
  });

  it("binds inherited eligibility at decision time and blocks it after release revocation or supersession", async () => {
    const release = await quarantine({
      decisionId: uuid("11111111-1111-4111-8111-111111111111"),
      appendOrdinal: 1,
      priorDecisionId: null,
      priorDecisionContentSha256: null,
      artifactSha256: sha("a"),
      findingIds: [],
      action: "release",
      resultingStatus: "released",
      ruleSetVersion: "1",
      schemaVersion: "1.0.0",
    });
    const inherited = await eligibility({
      decisionId: uuid("33333333-3333-4333-8333-333333333333"),
      appendOrdinal: 1,
      priorDecisionId: null,
      priorDecisionContentSha256: null,
      artifactSha256: sha("a"),
      action: "inherit-approval",
      resultingStatus: "eligible",
      sourceQuarantineDecisionId: release.decisionId,
      sourceQuarantineDecisionContentSha256: release.decisionContentSha256,
      ruleSetVersion: "1",
      schemaVersion: "1.0.0",
    });
    expect(
      await replayArtifactEligibility(sha("a"), [inherited], [release]),
    ).toMatchObject({
      ok: true,
      value: { eligible: true },
    });
    const revoke = await quarantine({
      decisionId: uuid("55555555-5555-4555-8555-555555555555"),
      appendOrdinal: 2,
      priorDecisionId: release.decisionId,
      priorDecisionContentSha256: release.decisionContentSha256,
      artifactSha256: sha("a"),
      findingIds: [],
      action: "revoke",
      resultingStatus: "revoked",
      ruleSetVersion: "1",
      schemaVersion: "1.0.0",
    });
    expect(
      await replayArtifactEligibility(sha("a"), [inherited], [release, revoke]),
    ).toMatchObject({
      ok: true,
      value: { eligible: false, effectiveStatus: "blocked" },
    });
    const supersede = await quarantine({
      decisionId: uuid("66666666-6666-4666-8666-666666666666"),
      appendOrdinal: 2,
      priorDecisionId: release.decisionId,
      priorDecisionContentSha256: release.decisionContentSha256,
      artifactSha256: sha("a"),
      findingIds: [],
      action: "supersede",
      resultingStatus: "superseded",
      ruleSetVersion: "1",
      schemaVersion: "1.0.0",
    });
    expect(
      await replayArtifactEligibility(
        sha("a"),
        [inherited],
        [release, supersede],
      ),
    ).toMatchObject({
      ok: true,
      value: { eligible: false, effectiveStatus: "blocked" },
    });
    expect(
      await replayArtifactEligibility(
        sha("b"),
        [{ ...inherited, artifactSha256: sha("b") }],
        [release],
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "INEFFECTIVE_SOURCE" },
    });
  });
});
