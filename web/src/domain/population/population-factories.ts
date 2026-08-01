/**
 * Population Profile Factories
 *
 * Content-addressed factory functions for creating population evidence
 * observations and candidate profiles. Uses deterministic SHA-256 hashing
 * to ensure reproducibility and tamper detection.
 */

import { canonicalizeTyped, hashTyped } from "../manifests/canonical-json";
import { parseSha256, type Sha256 } from "../shared/types";
import type {
  PopulationEvidenceObservation,
  PopulationCandidateProfile,
} from "./population-types";

/**
 * Creates a content-addressed population evidence observation.
 * The evidenceKey is a deterministic SHA-256 hash of the observation content.
 */
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

/**
 * Creates a content-addressed population candidate profile.
 * The candidateKey is a deterministic SHA-256 hash of the candidate content.
 */
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

/**
 * Returns a deterministic canonical JSON representation of a candidate.
 */
export function canonicalPopulationCandidate(
  candidate: PopulationCandidateProfile,
): string {
  return canonicalizeTyped(candidate, { typeName: "PopulationCandidate" });
}

/**
 * Computes a deterministic SHA-256 hash for the evidence manifest
 * population section.
 */
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

function sha(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new Error("Internal population SHA-256 failed.");
  return parsed.value;
}
