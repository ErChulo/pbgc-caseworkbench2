import { sha256Bytes } from "../../domain/shared/digest";
import type { Sha256 } from "../../domain/shared/types";
import {
  validatePopulationEvidence,
  replayPopulationCandidateDecisions,
} from "../../domain/population/population-governance";
import { detectWorkbookPopulation } from "../../domain/population/population-detector";
import type {
  PopulationCandidateDecision,
  PopulationCandidateProfile,
  PopulationDecisionProjection,
  PopulationEvidenceObservation,
} from "../../domain/population/population-types";
import {
  adaptWorkbookExtraction,
  adaptWorkbookNamedRanges,
  workbookProfileContentHash,
  type WorkbookNamedRangeObservation,
  type WorkbookPopulationProfile,
} from "../../domain/population/workbook-adapter";
import { parseWorkbookPassive } from "./workbook-parser";

export interface VerifiedPopulationWorkbook {
  readonly workbook: WorkbookPopulationProfile;
  readonly namedRanges: readonly WorkbookNamedRangeObservation[];
  readonly sourceArtifactSha256: Sha256;
  readonly candidateKey: Sha256;
  readonly populationDecision: PopulationDecisionProjection;
  readonly populationDecisionContentSha256: Sha256;
  readonly parserVersion: string;
}
export type VerifiedWorkbookResult =
  | { readonly ok: true; readonly value: VerifiedPopulationWorkbook }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** Byte and replay consistency only; human authority and artifact eligibility are separate. */
export async function verifyPopulationWorkbook(input: {
  readonly bytes: Uint8Array;
  readonly candidate: PopulationCandidateProfile;
  readonly observations: readonly PopulationEvidenceObservation[];
  readonly decisions: readonly PopulationCandidateDecision[];
}): Promise<VerifiedWorkbookResult> {
  const fail = (code: string, message: string): VerifiedWorkbookResult => ({
    ok: false,
    code,
    message,
  });
  try {
    const bytes = new Uint8Array(input.bytes);
    const candidate = structuredClone(input.candidate);
    const observations = structuredClone(input.observations);
    const decisions = structuredClone(input.decisions);
    const sourceHash = await sha256Bytes(bytes);
    if (sourceHash !== candidate.artifactSha256)
      return fail(
        "SOURCE_BYTES_MISMATCH",
        "The workbook bytes do not match the population candidate.",
      );
    if (candidate.evidence.length === 0)
      return fail(
        "POPULATION_EVIDENCE_MISSING",
        "Population evidence is required.",
      );
    const evidence = await validatePopulationEvidence(candidate, observations, [
      sourceHash,
    ]);
    if (!evidence.ok)
      return fail(
        "POPULATION_EVIDENCE_INVALID",
        "Population evidence does not match this source workbook.",
      );
    const extraction = parseWorkbookPassive(bytes);
    const workbook = adaptWorkbookExtraction(extraction);
    const names = adaptWorkbookNamedRanges(extraction);
    if (
      workbook.status !== "profiled" ||
      !names.ok ||
      extraction.riskIndicators.length > 0
    )
      return fail(
        "WORKBOOK_INSPECTION_BLOCKED",
        "The source workbook could not be safely profiled.",
      );
    const observedCandidate = await detectWorkbookPopulation(
      sourceHash,
      workbook,
      candidate.sensitivity,
    );
    if (observedCandidate.candidate.candidateKey !== candidate.candidateKey)
      return fail(
        "POPULATION_CANDIDATE_MISMATCH",
        "The candidate does not match the current workbook inspection.",
      );
    const profileHash = await workbookProfileContentHash(
      workbook,
      names.ranges,
    );
    const replay = await replayPopulationCandidateDecisions(
      candidate,
      profileHash,
      decisions,
    );
    const effective = decisions.at(-1);
    if (
      !replay.ok ||
      replay.value.status !== "approved" ||
      effective?.decisionId !== replay.value.effectiveDecisionId
    )
      return fail(
        "POPULATION_DECISION_INVALID",
        "The exact workbook profile needs an effective population approval.",
      );
    return {
      ok: true,
      value: {
        workbook,
        namedRanges: names.ranges,
        sourceArtifactSha256: sourceHash,
        candidateKey: candidate.candidateKey,
        populationDecision: replay.value,
        populationDecisionContentSha256: effective.decisionContentSha256,
        parserVersion: extraction.parserVersion,
      },
    };
  } catch {
    return fail(
      "POPULATION_VERIFICATION_FAILED",
      "Population source verification could not be completed.",
    );
  }
}
