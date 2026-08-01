/**
 * Population Governance
 *
 * Validation and decision replay logic for population candidate governance.
 * Implements the decision transition state machine, chain integrity verification,
 * and evidence validation with staleness detection.
 */

import { canonicalizeTyped, hashTyped } from "../manifests/canonical-json";
import { parseSha256, type Result, type Sha256 } from "../shared/types";
import type {
  PopulationCandidateProfile,
  PopulationCandidateDecision,
  PopulationDecisionProjection,
  PopulationEvidenceObservation,
  PopulationGovernedStatus,
  PopulationProfileError,
} from "./population-types";
import { createPopulationEvidenceObservation } from "./population-factories";

/**
 * Validates a population candidate against its evidence observations and
 * artifact hashes. Performs four validation passes:
 * 1. Artifact presence check
 * 2. Evidence uniqueness and manifest presence
 * 3. Evidence staleness detection via re-hashing
 * 4. Candidate key integrity verification
 */
export async function validatePopulationEvidence(
  candidate: PopulationCandidateProfile,
  observations: readonly PopulationEvidenceObservation[],
  artifactHashes: readonly Sha256[],
): Promise<Result<true, PopulationProfileError>> {
  if (!artifactHashes.includes(candidate.artifactSha256))
    return fail(
      "INCOMPLETE_MANIFEST",
      "Candidate artifact is absent from the validated manifest.",
    );
  const keys = new Set<string>();
  const citations = new Set<string>();
  for (const observation of observations) {
    if (
      keys.has(observation.evidenceKey) ||
      citations.has(observation.citationId)
    )
      return fail(
        "DUPLICATE_EVIDENCE",
        "Population evidence keys and citation identifiers must be unique.",
      );
    keys.add(observation.evidenceKey);
    citations.add(observation.citationId);
    if (!artifactHashes.includes(observation.artifactSha256))
      return fail(
        "INCOMPLETE_MANIFEST",
        "Population evidence cites an artifact absent from the manifest.",
      );
    const recomputed = await createPopulationEvidenceObservation(observation);
    if (recomputed.evidenceKey !== observation.evidenceKey)
      return fail(
        "STALE_EVIDENCE",
        "Population observation content does not match its evidence key.",
      );
  }
  for (const reference of candidate.evidence) {
    const matches = observations.filter(
      (observation) => observation.evidenceKey === reference.evidenceKey,
    );
    if (matches.length !== 1)
      return fail(
        "INCOMPLETE_MANIFEST",
        "Every population evidence reference must resolve exactly once.",
      );
    const match = matches[0];
    if (match === undefined)
      return fail(
        "INCOMPLETE_MANIFEST",
        "Population evidence reference could not be resolved.",
      );
    if (
      canonicalizeTyped(evidenceContent(match), {}) !==
      canonicalizeTyped(evidenceContent(reference), {})
    )
      return fail(
        "STALE_EVIDENCE",
        "Population evidence reference does not exactly match its observation.",
      );
  }
  const { candidateKey: ignored, ...content } = candidate;
  void ignored;
  if (
    sha(await hashTyped(content, { typeName: "PopulationCandidate" })) !==
    candidate.candidateKey
  )
    return fail(
      "INVALID_HASH",
      "Population candidate content does not match its candidate key.",
    );
  return { ok: true, value: true };
}

/**
 * Computes the deterministic content hash for a population decision.
 */
export async function populationDecisionContentHash(
  decision: Omit<
    PopulationCandidateDecision,
    | "decisionId"
    | "decisionContentSha256"
    | "humanActor"
    | "rationale"
    | "decisionTimestamp"
  >,
): Promise<Sha256> {
  return sha(
    await hashTyped(
      {
        appendOrdinal: decision.appendOrdinal,
        priorDecisionContentSha256: decision.priorDecisionContentSha256,
        candidateKey: decision.candidateKey,
        artifactSha256: decision.artifactSha256,
        workbookProfileContentSha256: decision.workbookProfileContentSha256,
        decisionType: decision.decisionType,
        resultingStatus: decision.resultingStatus,
        ruleSetVersion: decision.ruleSetVersion,
        schemaVersion: decision.schemaVersion,
      },
      {},
    ),
  );
}

/**
 * Replays a decision chain to derive the final governance status projection.
 * Validates chain integrity, human actor requirement, subject matching,
 * hash verification, and transition state machine rules.
 */
export async function replayPopulationCandidateDecisions(
  candidate: PopulationCandidateProfile,
  workbookProfileContentSha256: Sha256,
  decisions: readonly PopulationCandidateDecision[],
): Promise<Result<PopulationDecisionProjection, PopulationProfileError>> {
  if (!["proposed", "unresolved"].includes(candidate.candidateStatus))
    return fail(
      "INVALID_TRANSITION",
      "Population candidate source state must remain proposal-only.",
    );
  let prior: PopulationCandidateDecision | null = null;
  const seen = new Set<string>();
  for (const decision of decisions) {
    if (
      (decision.humanActor as { readonly actorType?: unknown }).actorType !==
      "human"
    )
      return fail(
        "INVALID_ACTOR",
        "Population candidate decisions require a human actor.",
      );
    if (
      decision.candidateKey !== candidate.candidateKey ||
      decision.artifactSha256 !== candidate.artifactSha256 ||
      decision.workbookProfileContentSha256 !== workbookProfileContentSha256
    )
      return fail(
        "MISMATCHED_SUBJECT",
        "Population decision does not concern this exact candidate, source artifact, and workbook profile.",
      );
    if (
      seen.has(decision.decisionId) ||
      decision.appendOrdinal !== (prior?.appendOrdinal ?? 0) + 1 ||
      (prior === null &&
        (decision.priorDecisionId !== null ||
          decision.priorDecisionContentSha256 !== null)) ||
      (prior !== null &&
        (decision.priorDecisionId !== prior.decisionId ||
          decision.priorDecisionContentSha256 !== prior.decisionContentSha256))
    )
      return fail(
        "INVALID_CHAIN",
        "Population decision chain must be gapless and unbranched.",
      );
    if (
      (await populationDecisionContentHash(decision)) !==
      decision.decisionContentSha256
    )
      return fail(
        "INVALID_HASH",
        "Population decision content hash is stale or invalid.",
      );
    if (
      !validTransition(
        prior?.resultingStatus ?? null,
        decision.decisionType,
        decision.resultingStatus,
      )
    )
      return fail(
        "INVALID_TRANSITION",
        "Population decision transition is not permitted.",
      );
    prior = decision;
    seen.add(decision.decisionId);
  }
  return {
    ok: true,
    value: Object.freeze({
      status: prior?.resultingStatus ?? "provisional",
      effectiveDecisionId: prior?.decisionId ?? null,
      effectiveWorkbookProfileContentSha256:
        prior?.workbookProfileContentSha256 ?? null,
      provenance: Object.freeze(
        decisions.map((decision) => decision.decisionId),
      ),
    }),
  };
}

function evidenceContent(input: {
  readonly citationId: string;
  readonly artifactSha256: Sha256;
  readonly sourceLocator: string;
  readonly evidenceKind: string;
  readonly observedTextOrValue?: unknown;
}) {
  return {
    citationId: input.citationId,
    artifactSha256: input.artifactSha256,
    sourceLocator: input.sourceLocator,
    evidenceKind: input.evidenceKind,
    ...(Object.prototype.hasOwnProperty.call(input, "observedTextOrValue")
      ? { observedTextOrValue: input.observedTextOrValue }
      : {}),
  };
}

function validTransition(
  prior: PopulationGovernedStatus | null,
  action: PopulationCandidateDecision["decisionType"],
  status: PopulationGovernedStatus,
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
  if (!parsed.ok) throw new Error("Internal population SHA-256 failed.");
  return parsed.value;
}

function fail(
  code: PopulationProfileError["code"],
  safeMessage: string,
): Result<never, PopulationProfileError> {
  return { ok: false, error: { code, safeMessage } };
}
