import { hashTyped } from "../manifests/canonical-json";
import {
  parseSha256,
  type Result,
  type Sha256,
  type Uuid,
} from "../shared/types";
import type {
  ClassificationReplayError,
  DecisionProjection,
  EvidenceRelationship,
  GovernedStatus,
  RelationshipDecision,
} from "./models";
import { relationshipKey as computeRelationshipKey } from "./near-duplicates";

export async function createRelationshipProposal(
  input: Omit<EvidenceRelationship, "relationshipKey">,
): Promise<EvidenceRelationship> {
  if (
    input.fromSha256 === input.toSha256 &&
    input.relationshipType !== "exact-duplicate"
  )
    throw new TypeError(
      "Same-byte records may only propose exact-duplicate identity.",
    );
  if (
    !["proposed", "unresolved"].includes(
      (input as { readonly status: string }).status,
    )
  )
    throw new TypeError("Relationships are proposal-only source evidence.");
  return Object.freeze({
    ...input,
    relationshipKey: await computeRelationshipKey(input),
  });
}

export async function relationshipDecisionContentHash(
  decision: Omit<
    RelationshipDecision,
    | "decisionId"
    | "decisionContentSha256"
    | "actor"
    | "decidedAt"
    | "rationale"
    | "evidenceConsidered"
  >,
): Promise<Sha256> {
  return sha(
    await hashTyped(
      {
        appendOrdinal: decision.appendOrdinal,
        priorDecisionContentSha256: decision.priorDecisionContentSha256,
        relationshipKey: decision.relationshipKey,
        fromSha256: decision.fromSha256,
        toSha256: decision.toSha256,
        decisionType: decision.decisionType,
        resultingGovernedStatus: decision.resultingGovernedStatus,
        ruleSetVersion: decision.ruleSetVersion,
        schemaVersion: decision.schemaVersion,
      },
      {},
    ),
  );
}

export async function replayRelationshipDecisions(
  relationship: EvidenceRelationship,
  decisions: readonly RelationshipDecision[],
  completeContext = true,
): Promise<Result<DecisionProjection, ClassificationReplayError>> {
  if (!completeContext && decisions.length > 0)
    return fail(
      "INCOMPLETE_CONTEXT",
      "A complete manifest is required for governed status.",
    );
  if (
    !["proposed", "unresolved"].includes(
      (relationship as { readonly status: string }).status,
    )
  )
    return fail(
      "INVALID_PROPOSAL",
      "Relationship source must remain proposal-only.",
    );
  let prior: RelationshipDecision | null = null;
  const seen = new Set<Uuid>();
  for (const decision of decisions) {
    if ((decision.actor as { actorType?: unknown }).actorType !== "human")
      return fail(
        "INVALID_ACTOR",
        "Relationship decisions require a human actor.",
      );
    if (
      decision.relationshipKey !== relationship.relationshipKey ||
      decision.fromSha256 !== relationship.fromSha256 ||
      decision.toSha256 !== relationship.toSha256
    )
      return fail(
        "MISMATCHED_SUBJECT",
        "Relationship subject or target is invalid.",
      );
    if (seen.has(decision.decisionId))
      return fail("INVALID_CHAIN", "Relationship chain branches or cycles.");
    if (decision.appendOrdinal !== (prior?.appendOrdinal ?? 0) + 1)
      return fail("INVALID_CHAIN", "Relationship ordinals must be gapless.");
    if (
      (prior === null &&
        (decision.priorDecisionId !== null ||
          decision.priorDecisionContentSha256 !== null)) ||
      (prior !== null &&
        (decision.priorDecisionId !== prior.decisionId ||
          decision.priorDecisionContentSha256 !== prior.decisionContentSha256))
    )
      return fail(
        "INVALID_CHAIN",
        "Relationship predecessor linkage is invalid.",
      );
    if (
      (await relationshipDecisionContentHash(decision)) !==
      decision.decisionContentSha256
    )
      return fail("INVALID_HASH", "Relationship decision hash is invalid.");
    if (
      !validTransition(
        prior?.resultingGovernedStatus ?? null,
        decision.decisionType,
        decision.resultingGovernedStatus,
      )
    )
      return fail(
        "INVALID_TRANSITION",
        "Relationship transition is not permitted.",
      );
    prior = decision;
    seen.add(decision.decisionId);
  }
  return ok(
    Object.freeze({
      status: prior?.resultingGovernedStatus ?? "provisional",
      effectiveDecisionId: prior?.decisionId ?? null,
      provenance: Object.freeze(decisions.map((item) => item.decisionId)),
    }),
  );
}

function validTransition(
  prior: GovernedStatus | null,
  action: RelationshipDecision["decisionType"],
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
  if (!parsed.ok) throw new Error("Internal relationship SHA-256 failed.");
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
