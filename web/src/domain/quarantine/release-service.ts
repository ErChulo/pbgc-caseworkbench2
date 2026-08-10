import { hashTyped } from "../manifests/canonical-json";
import {
  parseSha256,
  type Result,
  type Sha256,
  type Uuid,
} from "../shared/types";
import type {
  ArtifactEligibilityDecision,
  ArtifactEligibilityProjection,
  FinalDisposition,
  QuarantineDecision,
} from "./models";

export interface DecisionReplayError {
  readonly code:
    | "INVALID_CHAIN"
    | "INVALID_HASH"
    | "INVALID_TRANSITION"
    | "INVALID_ACTOR"
    | "MISMATCHED_ARTIFACT"
    | "INEFFECTIVE_SOURCE";
  readonly safeMessage: string;
}

export async function quarantineDecisionContentHash(
  decision: Omit<
    QuarantineDecision,
    | "decisionContentSha256"
    | "decisionId"
    | "reviewer"
    | "decidedAt"
    | "rationale"
  >,
): Promise<Sha256> {
  return asSha256(
    await hashTyped(
      {
        appendOrdinal: decision.appendOrdinal,
        priorDecisionContentSha256: decision.priorDecisionContentSha256,
        artifactSha256: decision.artifactSha256,
        findingIds: [...decision.findingIds].sort(),
        action: decision.action,
        resultingStatus: decision.resultingStatus,
        ruleSetVersion: decision.ruleSetVersion,
        schemaVersion: decision.schemaVersion,
      },
      {},
    ),
  );
}

export async function replayQuarantineDecisions(
  artifactSha256: Sha256,
  decisions: readonly QuarantineDecision[],
): Promise<Result<ArtifactEligibilityProjection, DecisionReplayError>> {
  if (decisions.length === 0) {
    return ok(projection(artifactSha256, false, "provisional", null, []));
  }
  let prior: QuarantineDecision | null = null;
  const seenDecisionIds = new Set<Uuid>();
  for (const decision of decisions) {
    if ((decision.reviewer as { actorType?: unknown }).actorType !== "human")
      return fail("INVALID_ACTOR", "Final decisions require a human actor.");
    if (decision.artifactSha256 !== artifactSha256)
      return fail(
        "MISMATCHED_ARTIFACT",
        "Decision bytes do not match the artifact.",
      );
    if (seenDecisionIds.has(decision.decisionId))
      return fail(
        "INVALID_CHAIN",
        "Decision chain contains a duplicate identifier or cycle.",
      );
    if (decision.appendOrdinal !== (prior?.appendOrdinal ?? 0) + 1)
      return fail("INVALID_CHAIN", "Decision ordinals must be gapless.");
    if (
      (prior === null &&
        (decision.priorDecisionId !== null ||
          decision.priorDecisionContentSha256 !== null)) ||
      (prior !== null &&
        (decision.priorDecisionId !== prior.decisionId ||
          decision.priorDecisionContentSha256 !== prior.decisionContentSha256))
    ) {
      return fail("INVALID_CHAIN", "Decision predecessor linkage is invalid.");
    }
    const expectedHash = await quarantineDecisionContentHash(decision);
    if (expectedHash !== decision.decisionContentSha256)
      return fail("INVALID_HASH", "Decision content hash is invalid.");
    if (
      !validQuarantineTransition(
        prior?.resultingStatus ?? null,
        decision.action,
        decision.resultingStatus,
      )
    ) {
      return fail(
        "INVALID_TRANSITION",
        "Quarantine decision transition is not permitted.",
      );
    }
    prior = decision;
    seenDecisionIds.add(decision.decisionId);
  }
  if (!prior)
    return ok(projection(artifactSha256, false, "provisional", null, []));
  return ok(
    projection(
      artifactSha256,
      prior.resultingStatus === "released",
      prior.resultingStatus,
      prior.decisionId,
      decisions.map((decision) => decision.decisionId),
    ),
  );
}

export async function artifactEligibilityContentHash(
  decision: Omit<
    ArtifactEligibilityDecision,
    | "decisionContentSha256"
    | "decisionId"
    | "actor"
    | "decidedAt"
    | "rationale"
    | "sourceQuarantineDecisionId"
  >,
): Promise<Sha256> {
  return asSha256(
    await hashTyped(
      {
        appendOrdinal: decision.appendOrdinal,
        priorDecisionContentSha256: decision.priorDecisionContentSha256,
        artifactSha256: decision.artifactSha256,
        action: decision.action,
        resultingStatus: decision.resultingStatus,
        sourceQuarantineDecisionContentSha256:
          decision.sourceQuarantineDecisionContentSha256,
        ruleSetVersion: decision.ruleSetVersion,
        schemaVersion: decision.schemaVersion,
      },
      {},
    ),
  );
}

export async function replayArtifactEligibility(
  artifactSha256: Sha256,
  decisions: readonly ArtifactEligibilityDecision[],
  quarantineDecisions: readonly QuarantineDecision[],
): Promise<Result<ArtifactEligibilityProjection, DecisionReplayError>> {
  let prior: ArtifactEligibilityDecision | null = null;
  let inheritedRelease: QuarantineDecision | null = null;
  const seenDecisionIds = new Set<Uuid>();
  for (const decision of decisions) {
    if ((decision.actor as { actorType?: unknown }).actorType !== "human")
      return fail(
        "INVALID_ACTOR",
        "Eligibility decisions require a human actor.",
      );
    if (decision.artifactSha256 !== artifactSha256)
      return fail(
        "MISMATCHED_ARTIFACT",
        "Eligibility decision bytes do not match.",
      );
    if (seenDecisionIds.has(decision.decisionId))
      return fail(
        "INVALID_CHAIN",
        "Eligibility chain contains a duplicate identifier or cycle.",
      );
    if (decision.appendOrdinal !== (prior?.appendOrdinal ?? 0) + 1)
      return fail("INVALID_CHAIN", "Eligibility ordinals must be gapless.");
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
        "Eligibility predecessor linkage is invalid.",
      );
    if (decision.action === "inherit-approval") {
      if (
        decision.appendOrdinal !== 1 ||
        decision.sourceQuarantineDecisionId === null ||
        decision.sourceQuarantineDecisionContentSha256 === null
      ) {
        return fail(
          "INEFFECTIVE_SOURCE",
          "Inherited eligibility requires an effective same-byte release.",
        );
      }
      const sourceIndex = quarantineDecisions.findIndex(
        (item) =>
          item.decisionId === decision.sourceQuarantineDecisionId &&
          item.decisionContentSha256 ===
            decision.sourceQuarantineDecisionContentSha256 &&
          item.artifactSha256 === artifactSha256 &&
          item.resultingStatus === "released",
      );
      const source = quarantineDecisions[sourceIndex];
      const replayed = await replayQuarantineDecisions(
        artifactSha256,
        quarantineDecisions.slice(0, sourceIndex + 1),
      );
      if (
        source === undefined ||
        sourceIndex < 0 ||
        !replayed.ok ||
        replayed.value.effectiveDecisionId !== source.decisionId
      ) {
        return fail(
          "INEFFECTIVE_SOURCE",
          "Referenced release is missing or ineffective.",
        );
      }
      inheritedRelease = source;
    }
    const expected = await artifactEligibilityContentHash(decision);
    if (expected !== decision.decisionContentSha256)
      return fail("INVALID_HASH", "Eligibility content hash is invalid.");
    if (
      !validEligibilityTransition(
        prior?.resultingStatus ?? null,
        decision.action,
        decision.resultingStatus,
      )
    )
      return fail(
        "INVALID_TRANSITION",
        "Eligibility transition is not permitted.",
      );
    prior = decision;
    seenDecisionIds.add(decision.decisionId);
  }
  if (!prior)
    return ok(projection(artifactSha256, false, "provisional", null, []));
  if (prior.resultingStatus === "eligible" && inheritedRelease !== null) {
    const currentQuarantine = await replayQuarantineDecisions(
      artifactSha256,
      quarantineDecisions,
    );
    if (!currentQuarantine.ok) return currentQuarantine;
    if (!currentQuarantine.value.eligible) {
      return ok(
        projection(
          artifactSha256,
          false,
          "blocked",
          prior.decisionId,
          decisions.map((decision) => decision.decisionId),
        ),
      );
    }
  }
  return ok(
    projection(
      artifactSha256,
      prior.resultingStatus === "eligible",
      prior.resultingStatus === "eligible" ? "released" : prior.resultingStatus,
      prior.decisionId,
      decisions.map((decision) => decision.decisionId),
    ),
  );
}

function validQuarantineTransition(
  prior: FinalDisposition | null,
  action: QuarantineDecision["action"],
  resulting: FinalDisposition,
): boolean {
  if (prior === null) {
    return (
      (action === "release" && resulting === "released") ||
      (action === "final-quarantine" && resulting === "final-quarantine") ||
      (action === "reject" && resulting === "rejected")
    );
  }
  if (prior === "released") {
    return (
      (action === "revoke" && resulting === "revoked") ||
      (action === "inherit-release" && resulting === "released") ||
      (action === "supersede" && resulting === "superseded")
    );
  }
  if (prior === "final-quarantine") {
    return (
      (action === "continue-quarantine" && resulting === "final-quarantine") ||
      (action === "release" && resulting === "released") ||
      (action === "supersede" && resulting === "superseded")
    );
  }
  return action === "supersede" && resulting === "superseded";
}

function validEligibilityTransition(
  prior: ArtifactEligibilityDecision["resultingStatus"] | null,
  action: ArtifactEligibilityDecision["action"],
  resulting: ArtifactEligibilityDecision["resultingStatus"],
): boolean {
  if (prior === null) {
    return (
      ((action === "approve" || action === "inherit-approval") &&
        resulting === "eligible") ||
      (action === "block" && resulting === "blocked")
    );
  }
  if (prior === "eligible") {
    return (
      (action === "revoke" && resulting === "revoked") ||
      (action === "supersede" && resulting === "superseded")
    );
  }
  return (
    (prior === "blocked" || prior === "revoked") &&
    action === "supersede" &&
    resulting === "superseded"
  );
}

function projection(
  artifactSha256: Sha256,
  eligible: boolean,
  effectiveStatus: ArtifactEligibilityProjection["effectiveStatus"],
  effectiveDecisionId: Uuid | null,
  provenance: readonly Uuid[],
): ArtifactEligibilityProjection {
  return Object.freeze({
    artifactSha256,
    eligible,
    effectiveStatus,
    effectiveDecisionId,
    provenance: Object.freeze([...provenance]),
  });
}

function ok<Value>(value: Value): Result<Value, never> {
  return { ok: true, value };
}

function fail(
  code: DecisionReplayError["code"],
  safeMessage: string,
): Result<never, DecisionReplayError> {
  return { ok: false, error: { code, safeMessage } };
}

function asSha256(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok)
    throw new Error("Internal deterministic SHA-256 generation failed.");
  return parsed.value;
}
