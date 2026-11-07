import { validateContract } from "../../contracts/schema-validator";
import { canonicalize, hashTyped } from "../manifests/canonical-json";
import { sha256Bytes } from "../shared/digest";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Sha256,
  type UtcTimestamp,
  type Uuid,
} from "../shared/types";
import { evaluateSection436 } from "./evaluation";
import type {
  Section436Evaluation,
  Section436Fact,
  Section436Rule,
} from "./models";
import {
  evaluationWithinRecordLimits,
  MAX_SECTION_436_FILE_BYTES,
  verifySection436Replay,
} from "./replay-verification";

export interface ProvisionalSection436Preview {
  readonly schemaVersion: "1.0.0";
  readonly kind: "provisional-section-436-preview";
  readonly sourceFileSha256: Sha256;
  readonly evaluation: Section436Evaluation;
  readonly limitations: readonly string[];
  readonly previewContentSha256: Sha256;
}

export interface EncodedSection436Preview {
  readonly preview: ProvisionalSection436Preview;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly bytesSha256: Sha256;
}

/** The input labels are assertions only; this is not approved casework. */
export async function createProvisionalSection436Preview(
  supplied: Uint8Array,
  expectedCaseId: Uuid,
  evaluatedAt: UtcTimestamp,
): Promise<EncodedSection436Preview> {
  if (
    !parseUuid(expectedCaseId).ok ||
    !parseUtcTimestamp(evaluatedAt).ok ||
    supplied.length === 0 ||
    supplied.length > MAX_SECTION_436_FILE_BYTES
  ) {
    throw new Error(
      "The input is empty, too large, or its case or timestamp is invalid.",
    );
  }
  const bytes = new Uint8Array(supplied);
  let input: unknown;
  try {
    input = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new Error("The input must contain valid UTF-8 JSON.");
  }
  if (input === null || typeof input !== "object" || Array.isArray(input))
    throw new Error("The input format is not supported.");
  const record = input as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !== "caseId,facts,rules" ||
    record.caseId !== expectedCaseId
  ) {
    throw new Error("The input format or active case ID does not match.");
  }
  // Validate nested facts and rules against the approved evaluation contract.
  // This envelope is used only for shape checking and is never emitted.
  const candidate = {
    schemaVersion: "1.0.0",
    artifactType: "section-436-evaluation",
    deterministicPayload: {
      schemaVersion: "1.0.0",
      caseId: expectedCaseId,
      evaluationStatus: "blocked",
      planYearStart: null,
      planYearEnd: null,
      facts: record.facts,
      rules: record.rules,
      missingRequiredFacts: [],
      matchedRuleIds: [],
      conclusionCode: "blocked",
      limitationEffect: null,
      citations: [],
      blockedReasons: [],
    },
    contentSha256: "0".repeat(64),
    operationalMetadata: {
      evaluatedAt,
      evaluatedBy: null,
      engineVersion: "section-436-evaluator-v1.0.0",
    },
  };
  if (
    !evaluationWithinRecordLimits(candidate) ||
    !validateContract("section436Evaluation", candidate).valid
  ) {
    throw new Error(
      "The facts or rules do not match the Section 436 contract or size limits.",
    );
  }
  const evaluation = await evaluateSection436({
    caseId: expectedCaseId,
    facts: record.facts as Section436Fact[],
    rules: record.rules as Section436Rule[],
    evaluatedAt,
    evaluatedBy: null,
  });
  if (!validateContract("section436Evaluation", evaluation).valid)
    throw new Error(
      "The generated evaluation does not match the Section 436 contract.",
    );
  // Recheck generated content and replay before making a downloadable snapshot.
  const evaluationBytes = new TextEncoder().encode(JSON.stringify(evaluation));
  await verifySection436Replay(evaluationBytes, expectedCaseId);
  const payload = {
    schemaVersion: "1.0.0" as const,
    kind: "provisional-section-436-preview" as const,
    sourceFileSha256: await sha256Bytes(bytes),
    evaluation,
    limitations: [
      "Input review labels, reviewer authority and source eligibility are not verified.",
      "This preview is not independent validation, actuarial approval or final casework output.",
      "The source file hash records local input bytes, not their authenticity.",
    ],
  };
  const hash = parseSha256(
    await hashTyped(payload, { typeName: "ProvisionalSection436Preview" }),
  );
  if (!hash.ok) throw new Error("The preview could not be hashed safely.");
  const preview = { ...payload, previewContentSha256: hash.value };
  const output = new TextEncoder().encode(`${canonicalize(preview)}\n`);
  if (output.length > 4 * MAX_SECTION_436_FILE_BYTES)
    throw new Error("The preview is too large to publish safely.");
  return { preview, bytes: output, bytesSha256: await sha256Bytes(output) };
}

/** Empty input scaffold; it contains no facts, rules, or approval claims. */
export function section436InputTemplate(caseId: Uuid): string {
  if (!parseUuid(caseId).ok) throw new Error("The active case ID is invalid.");
  return `${JSON.stringify({ caseId, facts: [], rules: [] }, null, 2)}\n`;
}
