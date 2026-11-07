import { validateContract } from "../../contracts/schema-validator";
import { canonicalize } from "../manifests/canonical-json";
import { sha256Bytes } from "../shared/digest";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Sha256,
  type Uuid,
} from "../shared/types";
import { createProvisionalSection436Preview } from "./provisional-preview";
import {
  evaluationWithinRecordLimits,
  MAX_SECTION_436_FILE_BYTES,
} from "./replay-verification";
import type {
  Section436Evaluation,
  Section436EvaluationStatus,
} from "./models";

export const MAX_SECTION_436_PREVIEW_BYTES = 4 * MAX_SECTION_436_FILE_BYTES;
export interface ProvisionalSection436Verification {
  readonly previewFileSha256: Sha256;
  readonly sourceFileSha256: Sha256;
  readonly previewContentSha256: Sha256;
  readonly evaluationStatus: Section436EvaluationStatus;
}

/** Compares local bytes and regeneration, not authenticity or independent approval. */
export async function verifyProvisionalSection436Preview(
  previewInput: Uint8Array,
  sourceInput: Uint8Array,
  caseId: Uuid,
): Promise<ProvisionalSection436Verification> {
  if (
    !parseUuid(caseId).ok ||
    previewInput.length === 0 ||
    previewInput.length > MAX_SECTION_436_PREVIEW_BYTES ||
    sourceInput.length === 0 ||
    sourceInput.length > MAX_SECTION_436_FILE_BYTES
  ) {
    throw new Error(
      "The files are empty, too large, or the active case ID is invalid.",
    );
  }
  // Snapshot both inputs before the first asynchronous operation.
  const previewBytes = new Uint8Array(previewInput);
  const sourceBytes = new Uint8Array(sourceInput);
  let raw: unknown;
  try {
    raw = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(previewBytes),
    ) as unknown;
  } catch {
    throw new Error("The preview must contain valid UTF-8 JSON.");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("The provisional preview format is not supported.");
  const record = raw as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !==
      "evaluation,kind,limitations,previewContentSha256,schemaVersion,sourceFileSha256" ||
    record.schemaVersion !== "1.0.0" ||
    record.kind !== "provisional-section-436-preview" ||
    !Array.isArray(record.limitations) ||
    record.limitations.length > 10 ||
    !record.limitations.every(
      (entry: unknown) => typeof entry === "string" && entry.length <= 300,
    ) ||
    typeof record.sourceFileSha256 !== "string" ||
    !parseSha256(record.sourceFileSha256).ok ||
    typeof record.previewContentSha256 !== "string" ||
    !parseSha256(record.previewContentSha256).ok ||
    !evaluationWithinRecordLimits(record.evaluation) ||
    !validateContract("section436Evaluation", record.evaluation).valid
  ) {
    throw new Error(
      "The provisional preview format or evaluation contract is not supported.",
    );
  }
  const evaluation = record.evaluation as Section436Evaluation;
  const timestamp = parseUtcTimestamp(
    evaluation.operationalMetadata.evaluatedAt,
  );
  if (!timestamp.ok || evaluation.deterministicPayload.caseId !== caseId)
    throw new Error("The preview timestamp or active case ID does not match.");
  const sourceHash = await sha256Bytes(sourceBytes);
  if (sourceHash !== record.sourceFileSha256)
    throw new Error("The input file hash does not match the preview.");
  const generated = await createProvisionalSection436Preview(
    sourceBytes,
    caseId,
    timestamp.value,
  );
  if (canonicalize(raw) !== canonicalize(generated.preview))
    throw new Error(
      "The preview does not match regeneration from the input with the current evaluator.",
    );
  return Object.freeze({
    previewFileSha256: await sha256Bytes(previewBytes),
    sourceFileSha256: sourceHash,
    previewContentSha256: generated.preview.previewContentSha256,
    evaluationStatus:
      generated.preview.evaluation.deterministicPayload.evaluationStatus,
  });
}
