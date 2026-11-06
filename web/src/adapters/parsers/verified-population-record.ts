import { sha256Bytes } from "../../domain/shared/digest";
import type { Sha256 } from "../../domain/shared/types";
import {
  validatePopulationEvidence,
  replayPopulationCandidateDecisions,
} from "../../domain/population/population-governance";
import type {
  PopulationCandidateDecision,
  PopulationCandidateProfile,
  PopulationEvidenceObservation,
} from "../../domain/population/population-types";
import {
  adaptWorkbookExtraction,
  adaptWorkbookNamedRanges,
  workbookProfileContentHash,
} from "../../domain/population/workbook-adapter";
import {
  projectPopulationRecord,
  type PopulationRecordFieldBinding,
  type PopulationRecordProjection,
} from "../../domain/population/record-projection";
import { parseWorkbookPassive } from "./workbook-parser";

export type VerifiedPopulationRecordResult =
  | {
      readonly ok: true;
      readonly record: PopulationRecordProjection;
      readonly sourceArtifactSha256: Sha256;
      readonly candidateKey: Sha256;
      readonly populationDecisionContentSha256: Sha256;
      readonly parserVersion: string;
    }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Reconstruct a selected record from exact local workbook bytes and replayed
 * population governance. This is consistency verification for review, not
 * reviewer authentication, approval of field mappings or release authority.
 */
export async function projectVerifiedPopulationRecord(input: {
  readonly bytes: Uint8Array;
  readonly candidate: PopulationCandidateProfile;
  readonly observations: readonly PopulationEvidenceObservation[];
  readonly decisions: readonly PopulationCandidateDecision[];
  readonly sheetName: string;
  readonly sourceRow: number;
  readonly bindings: readonly PopulationRecordFieldBinding[];
}): Promise<VerifiedPopulationRecordResult> {
  const fail = (
    code: string,
    message: string,
  ): VerifiedPopulationRecordResult => ({ ok: false, code, message });
  try {
    // Snapshot all inputs before the first await so a caller cannot swap data mid-check.
    const bytes = new Uint8Array(input.bytes);
    const candidate = structuredClone(input.candidate);
    const observations = structuredClone(input.observations);
    const decisions = structuredClone(input.decisions);
    const bindings = structuredClone(input.bindings);
    const sheetName = input.sheetName;
    const sourceRow = input.sourceRow;
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
    const projection = await projectPopulationRecord({
      workbook,
      namedRanges: names.ranges,
      populationDecision: replay.value,
      sheetName,
      sourceRow,
      bindings,
    });
    if (!projection.ok)
      return { ok: false, code: projection.code, message: projection.message };
    return {
      ok: true,
      record: projection.record,
      sourceArtifactSha256: sourceHash,
      candidateKey: candidate.candidateKey,
      populationDecisionContentSha256: effective.decisionContentSha256,
      parserVersion: extraction.parserVersion,
    };
  } catch {
    return fail(
      "RECORD_VERIFICATION_FAILED",
      "Population record verification could not be completed.",
    );
  }
}
