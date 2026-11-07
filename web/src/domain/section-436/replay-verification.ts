import { validateContract } from "../../contracts/schema-validator";
import { hashTyped } from "../manifests/canonical-json";
import { sha256Bytes } from "../shared/digest";
import {
  parseUtcTimestamp,
  parseUuid,
  type Sha256,
  type Uuid,
} from "../shared/types";
import { evaluateSection436 } from "./evaluation";
import type {
  Section436Evaluation,
  Section436EvaluationStatus,
} from "./models";

export const MAX_SECTION_436_FILE_BYTES = 1024 * 1024;
const MAX_RECORDS = 500;
const MAX_CITATIONS = 4000;

export interface Section436ReplaySummary {
  readonly fileSha256: Sha256;
  readonly evaluationContentSha256: Sha256;
  readonly evaluationStatus: Section436EvaluationStatus;
}

/** Checks local consistency, not source authority, approval, or actuarial correctness. */
export async function verifySection436Replay(
  supplied: Uint8Array,
  expectedCaseId: Uuid,
): Promise<Section436ReplaySummary> {
  if (
    !parseUuid(expectedCaseId).ok ||
    supplied.byteLength === 0 ||
    supplied.byteLength > MAX_SECTION_436_FILE_BYTES
  ) {
    throw new Error("The file is empty, too large, or the case ID is invalid.");
  }
  // Snapshot before any asynchronous operation.
  const bytes = new Uint8Array(supplied);
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new Error("The file must contain valid UTF-8 JSON.");
  }
  if (
    !evaluationWithinRecordLimits(parsed) ||
    !validateContract("section436Evaluation", parsed).valid
  ) {
    throw new Error(
      "The evaluation does not match the supported Section 436 contract or size limits.",
    );
  }
  const evaluation = parsed as Section436Evaluation;
  if (!parseUtcTimestamp(evaluation.operationalMetadata.evaluatedAt).ok) {
    throw new Error("The evaluation timestamp is invalid.");
  }
  if (evaluation.deterministicPayload.caseId !== expectedCaseId) {
    throw new Error("The evaluation does not belong to the active case.");
  }
  const contentHash = await hashTyped(evaluation.deterministicPayload, {
    typeName: "Section436Evaluation",
  });
  if (contentHash !== evaluation.contentSha256) {
    throw new Error("The evaluation content hash does not match its payload.");
  }
  const replay = await evaluateSection436({
    caseId: evaluation.deterministicPayload.caseId,
    facts: evaluation.deterministicPayload.facts,
    rules: evaluation.deterministicPayload.rules,
    evaluatedAt: evaluation.operationalMetadata.evaluatedAt,
    evaluatedBy: evaluation.operationalMetadata.evaluatedBy,
  });
  if (replay.contentSha256 !== evaluation.contentSha256) {
    throw new Error(
      "The evaluation does not match the current local evaluator replay.",
    );
  }
  return Object.freeze({
    fileSha256: await sha256Bytes(bytes),
    evaluationContentSha256: evaluation.contentSha256,
    evaluationStatus: evaluation.deterministicPayload.evaluationStatus,
  });
}

export function evaluationWithinRecordLimits(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const payload: unknown = (value as Record<string, unknown>)
    .deterministicPayload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return false;
  const record = payload as Record<string, unknown>;
  const facts = record.facts;
  const rules = record.rules;
  if (
    !Array.isArray(facts) ||
    !Array.isArray(rules) ||
    facts.length > MAX_RECORDS ||
    rules.length > MAX_RECORDS
  )
    return false;
  let citations = 0;
  for (const entry of [...(facts as unknown[]), ...(rules as unknown[])]) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry))
      return false;
    const list = (entry as Record<string, unknown>).citations;
    if (!Array.isArray(list)) return false;
    citations += list.length;
    if (citations > MAX_CITATIONS) return false;
  }
  return true;
}
