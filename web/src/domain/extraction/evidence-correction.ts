import { hashTyped } from "../manifests/canonical-json";
import {
  parseSha256,
  parseUtcTimestamp,
  type Result,
  type Sha256,
  type UtcTimestamp,
} from "../shared/types";

export interface EvidenceTextCorrection {
  readonly schemaVersion: "1.0.0";
  readonly artifactSha256: Sha256;
  readonly extractionContentSha256: Sha256;
  readonly correctedText: string;
  readonly correctedBy: string;
  readonly correctedAt: UtcTimestamp;
  readonly correctionContentSha256: Sha256;
}

export interface EvidenceCorrectionPointer {
  readonly correctionContentSha256: Sha256;
  readonly writtenAt: UtcTimestamp | null;
}

interface EvidenceCorrectionError {
  readonly code: "INVALID_EVIDENCE_CORRECTION";
  readonly message: string;
}

type CorrectionPayload = Omit<
  EvidenceTextCorrection,
  "correctionContentSha256"
>;

export async function createEvidenceTextCorrection(
  payload: CorrectionPayload,
): Promise<EvidenceTextCorrection> {
  return Object.freeze({
    ...payload,
    correctionContentSha256: asSha256(
      await hashTyped(payload, { typeName: "EvidenceTextCorrection" }),
    ),
  });
}

export async function parseEvidenceTextCorrection(
  value: unknown,
): Promise<Result<EvidenceTextCorrection, EvidenceCorrectionError>> {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0.0" ||
    typeof value.artifactSha256 !== "string" ||
    typeof value.extractionContentSha256 !== "string" ||
    typeof value.correctionContentSha256 !== "string" ||
    typeof value.correctedText !== "string" ||
    typeof value.correctedBy !== "string" ||
    value.correctedBy.trim() === "" ||
    typeof value.correctedAt !== "string"
  ) {
    return invalid("Evidence text correction structure is invalid.");
  }
  const artifactSha256 = parseSha256(value.artifactSha256);
  const extractionContentSha256 = parseSha256(value.extractionContentSha256);
  const correctionContentSha256 = parseSha256(value.correctionContentSha256);
  const correctedAt = parseUtcTimestamp(value.correctedAt);
  if (
    !artifactSha256.ok ||
    !extractionContentSha256.ok ||
    !correctionContentSha256.ok ||
    !correctedAt.ok
  ) {
    return invalid("Evidence text correction identity is invalid.");
  }
  const correction = value as unknown as EvidenceTextCorrection;
  const { correctionContentSha256: ignored, ...payload } = correction;
  void ignored;
  try {
    if (
      asSha256(
        await hashTyped(payload, { typeName: "EvidenceTextCorrection" }),
      ) !== correctionContentSha256.value
    ) {
      return invalid("Evidence text correction content hash does not match.");
    }
  } catch {
    return invalid("Evidence text correction hash could not be verified.");
  }
  return { ok: true, value: correction };
}

export function parseEvidenceCorrectionPointer(
  value: unknown,
): Result<EvidenceCorrectionPointer, EvidenceCorrectionError> {
  if (!isRecord(value) || typeof value.correctionContentSha256 !== "string") {
    return invalid("Evidence correction pointer is invalid.");
  }
  const correctionContentSha256 = parseSha256(value.correctionContentSha256);
  if (!correctionContentSha256.ok) {
    return invalid("Evidence correction pointer hash is invalid.");
  }
  let writtenAt: UtcTimestamp | null = null;
  if (value.writtenAt !== null && value.writtenAt !== undefined) {
    if (typeof value.writtenAt !== "string") {
      return invalid("Evidence correction pointer timestamp is invalid.");
    }
    const parsed = parseUtcTimestamp(value.writtenAt);
    if (!parsed.ok) {
      return invalid("Evidence correction pointer timestamp is invalid.");
    }
    writtenAt = parsed.value;
  }
  return {
    ok: true,
    value: {
      correctionContentSha256: correctionContentSha256.value,
      writtenAt,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asSha256(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new Error("Evidence correction SHA-256 is invalid.");
  return parsed.value;
}

function invalid(
  message: string,
): Result<never, EvidenceCorrectionError> {
  return {
    ok: false,
    error: { code: "INVALID_EVIDENCE_CORRECTION", message },
  };
}
