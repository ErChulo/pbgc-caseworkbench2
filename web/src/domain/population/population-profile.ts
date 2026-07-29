import { canonicalizeTyped, hashTyped } from "../manifests/canonical-json";
import { parseSha256, type Result, type Sha256 } from "../shared/types";

export type PopulationCandidateStatus = "proposed" | "unresolved";
export type PopulationGovernedStatus =
  "approved" | "rejected" | "revoked" | "superseded";

export interface PopulationEvidenceObservation {
  readonly evidenceKey: Sha256;
  readonly citationId: string;
  readonly artifactSha256: Sha256;
  readonly sourceLocator: string;
  readonly evidenceKind: string;
  readonly observedTextOrValue?: unknown;
}

export interface PopulationEvidenceReference {
  readonly evidenceKey: Sha256;
  readonly citationId: string;
  readonly artifactSha256: Sha256;
  readonly sourceLocator: string;
  readonly evidenceKind: string;
  readonly observedTextOrValue?: unknown;
}

export interface PopulationCandidateProfile {
  readonly candidateKey: Sha256;
  readonly artifactSha256: Sha256;
  readonly candidateStatus: PopulationCandidateStatus;
  readonly detectorIdentity: string;
  readonly detectorVersion: string;
  readonly confidence: number;
  readonly evidence: readonly PopulationEvidenceReference[];
  readonly observedFields: readonly string[];
  readonly recordCounts: readonly number[];
  readonly sensitivity:
    "authorized-real" | "de-identified" | "synthetic-mock" | "unknown";
  readonly correctionsOrImputationsApplied: false;
}

export interface HumanActor {
  readonly actorType: "human";
  readonly actorId: string;
  readonly displayName: string;
}

export interface PopulationCandidateDecision {
  readonly decisionId: string;
  readonly decisionContentSha256: Sha256;
  readonly appendOrdinal: number;
  readonly priorDecisionId: string | null;
  readonly priorDecisionContentSha256: Sha256 | null;
  readonly candidateKey: Sha256;
  readonly artifactSha256: Sha256;
  readonly workbookProfileContentSha256: Sha256;
  readonly decisionType: "approve" | "reject" | "revoke" | "supersede";
  readonly humanActor: HumanActor;
  readonly rationale: string;
  readonly decisionTimestamp: string;
  readonly resultingStatus: PopulationGovernedStatus;
  readonly ruleSetVersion: string;
  readonly schemaVersion: string;
}

export interface PopulationDecisionProjection {
  readonly status: PopulationGovernedStatus | "provisional";
  readonly effectiveDecisionId: string | null;
  readonly effectiveWorkbookProfileContentSha256: Sha256 | null;
  readonly provenance: readonly string[];
}

export interface PopulationProfileError {
  readonly code:
    | "INVALID_HASH"
    | "INCOMPLETE_MANIFEST"
    | "DUPLICATE_EVIDENCE"
    | "STALE_EVIDENCE"
    | "MISMATCHED_SUBJECT"
    | "INVALID_ACTOR"
    | "INVALID_CHAIN"
    | "INVALID_TRANSITION";
  readonly safeMessage: string;
}

export async function createPopulationEvidenceObservation(input: {
  readonly citationId: string;
  readonly artifactSha256: Sha256;
  readonly sourceLocator: string;
  readonly evidenceKind: string;
  readonly observedTextOrValue?: unknown;
}): Promise<PopulationEvidenceObservation> {
  const content = evidenceContent(input);
  return Object.freeze({
    evidenceKey: sha(await hashTyped(content, {})),
    ...content,
  });
}

export async function createPopulationCandidate(
  input: Omit<PopulationCandidateProfile, "candidateKey">,
): Promise<PopulationCandidateProfile> {
  const candidate = Object.freeze({
    ...input,
    evidence: Object.freeze([...input.evidence]),
    observedFields: Object.freeze([...input.observedFields]),
    recordCounts: Object.freeze([...input.recordCounts]),
  });
  return Object.freeze({
    candidateKey: sha(
      await hashTyped(candidate, { typeName: "PopulationCandidate" }),
    ),
    ...candidate,
  });
}

export function canonicalPopulationCandidate(
  candidate: PopulationCandidateProfile,
): string {
  return canonicalizeTyped(candidate, { typeName: "PopulationCandidate" });
}

export async function populationManifestHash(input: {
  readonly artifacts: readonly {
    readonly artifactKey: string;
    readonly sha256: Sha256;
  }[];
  readonly populationEvidenceObservations: readonly PopulationEvidenceObservation[];
  readonly populationCandidates: readonly PopulationCandidateProfile[];
}): Promise<Sha256> {
  return sha(
    await hashTyped(
      { deterministicPayload: input },
      { schemaId: "evidence-manifest.schema.json" },
    ),
  );
}

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
