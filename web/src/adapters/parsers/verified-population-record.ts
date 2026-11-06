import type { Sha256 } from "../../domain/shared/types";
import type {
  PopulationCandidateDecision,
  PopulationCandidateProfile,
  PopulationEvidenceObservation,
} from "../../domain/population/population-types";
import {
  projectPopulationRecord,
  type PopulationRecordFieldBinding,
  type PopulationRecordProjection,
} from "../../domain/population/record-projection";
import { verifyPopulationWorkbook } from "./verified-population-workbook";

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
    const verified = await verifyPopulationWorkbook({
      bytes,
      candidate,
      observations,
      decisions,
    });
    if (!verified.ok) return verified;
    const { workbook, namedRanges, populationDecision } = verified.value;
    const projection = await projectPopulationRecord({
      workbook,
      namedRanges,
      populationDecision,
      sheetName,
      sourceRow,
      bindings,
    });
    if (!projection.ok)
      return { ok: false, code: projection.code, message: projection.message };
    return {
      ok: true,
      record: projection.record,
      sourceArtifactSha256: verified.value.sourceArtifactSha256,
      candidateKey: verified.value.candidateKey,
      populationDecisionContentSha256:
        verified.value.populationDecisionContentSha256,
      parserVersion: verified.value.parserVersion,
    };
  } catch {
    return fail(
      "RECORD_VERIFICATION_FAILED",
      "Population record verification could not be completed.",
    );
  }
}
