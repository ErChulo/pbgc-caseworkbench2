import { hashTyped } from "../manifests/canonical-json";
import {
  parseSha256,
  type Result,
  type Sha256,
  type Uuid,
} from "../shared/types";
import {
  classificationDecisionContentHash,
  replayClassificationApprovals,
} from "./classification-review";
import type {
  AuthorityDecision,
  AuthorityProjection,
  ClassificationApproval,
  ClassificationProposal,
  ClassificationReplayError,
  GovernedStatus,
} from "./models";

export async function sourceRoleProposalContentHash(
  proposal: ClassificationProposal,
): Promise<Sha256> {
  return sha(await hashTyped(proposal, {}));
}

export async function authorityDecisionContentHash(
  decision: Omit<
    AuthorityDecision,
    | "authorityDecisionId"
    | "decisionContentSha256"
    | "approver"
    | "decisionTimestamp"
    | "rationale"
    | "sourceRoleProposalId"
    | "classificationApprovalId"
    | "priorDecisionId"
  >,
): Promise<Sha256> {
  return sha(
    await hashTyped(
      {
        appendOrdinal: decision.appendOrdinal,
        priorDecisionContentSha256: decision.priorDecisionContentSha256,
        sourceRoleProposalContentSha256:
          decision.sourceRoleProposalContentSha256,
        classificationApprovalContentSha256:
          decision.classificationApprovalContentSha256,
        artifactSha256: decision.artifactSha256,
        decision: decision.decision,
        ruleSetVersion: decision.ruleSetVersion,
        schemaVersion: decision.schemaVersion,
      },
      {},
    ),
  );
}

export async function replayAuthorityDecisions(
  proposal: ClassificationProposal,
  classificationApprovals: readonly ClassificationApproval[],
  authorityDecisions: readonly AuthorityDecision[],
): Promise<Result<AuthorityProjection, ClassificationReplayError>> {
  if (
    proposal.dimension !== "source-role" ||
    proposal.proposedValue !== "authority-candidate" ||
    !proposal.authorityCandidate
  )
    return fail(
      "INVALID_PROPOSAL",
      "Authority requires a source-role authority candidate.",
    );
  const classification = await replayClassificationApprovals(
    proposal,
    classificationApprovals,
  );
  if (!classification.ok || classification.value.status !== "approved")
    return fail(
      "INEFFECTIVE_APPROVAL",
      "Current human classification approval is required.",
    );
  const effectiveApproval = classificationApprovals.at(-1);
  if (!effectiveApproval)
    return fail("INEFFECTIVE_APPROVAL", "Classification approval is missing.");
  const proposalHash = await sourceRoleProposalContentHash(proposal);
  const approvalHash =
    await classificationDecisionContentHash(effectiveApproval);
  let prior: AuthorityDecision | null = null;
  const seen = new Set<Uuid>();
  for (const decision of authorityDecisions) {
    if ((decision.approver as { actorType?: unknown }).actorType !== "human")
      return fail(
        "INVALID_ACTOR",
        "Authority decisions require a human actor.",
      );
    if (
      decision.sourceRoleProposalId !== proposal.proposalKey ||
      decision.sourceRoleProposalContentSha256 !== proposalHash ||
      decision.classificationApprovalId !== effectiveApproval.approvalId ||
      decision.classificationApprovalContentSha256 !== approvalHash ||
      decision.artifactSha256 !== proposal.artifactSha256 ||
      decision.sourceRoleProposalArtifactSha256 !== proposal.artifactSha256 ||
      decision.classificationApprovalArtifactSha256 !== proposal.artifactSha256
    )
      return fail(
        "MISMATCHED_SUBJECT",
        "Authority lineage does not resolve to the current same-byte approval.",
      );
    if (seen.has(decision.authorityDecisionId))
      return fail("INVALID_CHAIN", "Authority chain branches or cycles.");
    if (decision.appendOrdinal !== (prior?.appendOrdinal ?? 0) + 1)
      return fail("INVALID_CHAIN", "Authority ordinals must be gapless.");
    if (
      (prior === null &&
        (decision.priorDecisionId !== null ||
          decision.priorDecisionContentSha256 !== null)) ||
      (prior !== null &&
        (decision.priorDecisionId !== prior.authorityDecisionId ||
          decision.priorDecisionContentSha256 !== prior.decisionContentSha256))
    )
      return fail("INVALID_CHAIN", "Authority predecessor linkage is invalid.");
    if (
      (await authorityDecisionContentHash(decision)) !==
      decision.decisionContentSha256
    )
      return fail("INVALID_HASH", "Authority decision hash is invalid.");
    if (!validTransition(prior?.decision ?? null, decision.decision))
      return fail(
        "INVALID_TRANSITION",
        "Authority transition is not permitted.",
      );
    prior = decision;
    seen.add(decision.authorityDecisionId);
  }
  return ok(
    Object.freeze({
      artifactSha256: proposal.artifactSha256,
      authoritative: prior?.decision === "approved",
      status: prior?.decision ?? "provisional",
      effectiveDecisionId: prior?.authorityDecisionId ?? null,
      provenance: Object.freeze(
        authorityDecisions.map((item) => item.authorityDecisionId),
      ),
    }),
  );
}

function validTransition(
  prior: GovernedStatus | null,
  next: GovernedStatus,
): boolean {
  if (prior === null) return next === "approved" || next === "rejected";
  if (prior === "approved") return next === "revoked" || next === "superseded";
  if (prior === "rejected" || prior === "revoked") return next === "superseded";
  return false;
}
function sha(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new Error("Internal authority SHA-256 failed.");
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
