import { hashTyped } from "../manifests/canonical-json";
import {
  parseSha256,
  type Result,
  type Sha256,
  type Uuid,
} from "../shared/types";
import type {
  ClassificationApproval,
  ClassificationProposal,
  ClassificationReplayError,
  DecisionProjection,
  GovernedStatus,
} from "./models";

export async function classificationDecisionContentHash(
  decision: Omit<
    ClassificationApproval,
    "approvalId" | "decisionContentSha256" | "actor" | "decidedAt" | "rationale"
  >,
): Promise<Sha256> {
  return sha(
    await hashTyped(
      {
        appendOrdinal: decision.appendOrdinal,
        priorApprovalContentSha256: decision.priorApprovalContentSha256,
        proposalKey: decision.proposalKey,
        artifactSha256: decision.artifactSha256,
        decisionType: decision.decisionType,
        status: decision.status,
        ruleSetVersion: decision.ruleSetVersion,
        schemaVersion: decision.schemaVersion,
      },
      {},
    ),
  );
}

export async function replayClassificationApprovals(
  proposal: ClassificationProposal,
  decisions: readonly ClassificationApproval[],
): Promise<Result<DecisionProjection, ClassificationReplayError>> {
  if (
    !["proposed", "unresolved"].includes(
      (proposal as { readonly status: string }).status,
    )
  )
    return fail(
      "INVALID_PROPOSAL",
      "Classification source must remain proposal-only.",
    );
  let prior: ClassificationApproval | null = null;
  const seen = new Set<Uuid>();
  for (const decision of decisions) {
    if ((decision.actor as { actorType?: unknown }).actorType !== "human")
      return fail(
        "INVALID_ACTOR",
        "Classification decisions require a human actor.",
      );
    if (
      decision.proposalKey !== proposal.proposalKey ||
      decision.artifactSha256 !== proposal.artifactSha256
    )
      return fail(
        "MISMATCHED_SUBJECT",
        "Classification decision subject is invalid.",
      );
    if (seen.has(decision.approvalId))
      return fail("INVALID_CHAIN", "Classification chain branches or cycles.");
    if (decision.appendOrdinal !== (prior?.appendOrdinal ?? 0) + 1)
      return fail("INVALID_CHAIN", "Classification ordinals must be gapless.");
    if (
      (prior === null &&
        (decision.priorApprovalId !== null ||
          decision.priorApprovalContentSha256 !== null)) ||
      (prior !== null &&
        (decision.priorApprovalId !== prior.approvalId ||
          decision.priorApprovalContentSha256 !== prior.decisionContentSha256))
    )
      return fail(
        "INVALID_CHAIN",
        "Classification predecessor linkage is invalid.",
      );
    if (
      (await classificationDecisionContentHash(decision)) !==
      decision.decisionContentSha256
    )
      return fail("INVALID_HASH", "Classification decision hash is invalid.");
    if (
      !validTransition(
        prior?.status ?? null,
        decision.decisionType,
        decision.status,
      )
    )
      return fail(
        "INVALID_TRANSITION",
        "Classification transition is not permitted.",
      );
    prior = decision;
    seen.add(decision.approvalId);
  }
  return ok(
    Object.freeze({
      status: prior?.status ?? "provisional",
      effectiveDecisionId: prior?.approvalId ?? null,
      provenance: Object.freeze(decisions.map((item) => item.approvalId)),
    }),
  );
}

export async function reusableApprovedClassification(
  source: ClassificationProposal,
  decisions: readonly ClassificationApproval[],
  duplicate: ClassificationProposal,
): Promise<Result<DecisionProjection, ClassificationReplayError>> {
  if (source.artifactSha256 !== duplicate.artifactSha256)
    return fail(
      "MISMATCHED_ARTIFACT",
      "Approved classification reuse requires identical bytes.",
    );
  if (
    source.dimension !== duplicate.dimension ||
    source.proposedValue !== duplicate.proposedValue
  )
    return fail(
      "MISMATCHED_SUBJECT",
      "Reusable classification dimensions must match.",
    );
  return replayClassificationApprovals(source, decisions);
}

function validTransition(
  prior: GovernedStatus | null,
  action: ClassificationApproval["decisionType"],
  status: GovernedStatus,
): boolean {
  if (prior === null)
    return (
      (action === "approve" && status === "approved") ||
      (action === "reject" && status === "rejected")
    );
  if (prior === "approved")
    return (
      (action === "revoke" && status === "revoked") ||
      (action === "supersede" && status === "superseded")
    );
  if (prior === "rejected" || prior === "revoked")
    return action === "supersede" && status === "superseded";
  return false;
}

function sha(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new Error("Internal classification SHA-256 failed.");
  return parsed.value;
}

function ok<Value>(value: Value): Result<Value, never> {
  return { ok: true, value };
}

function fail(
  code: ClassificationReplayError["code"],
  safeMessage: string,
): Result<never, ClassificationReplayError> {
  return { ok: false, error: { code, safeMessage } };
}
