import type { PassiveExtraction } from "../../adapters/parsers/passive-result";
import { hashTyped } from "../manifests/canonical-json";
import {
  parseSha256,
  parseUtcTimestamp,
  type Result,
  type Sha256,
  type UtcTimestamp,
} from "../shared/types";

export interface EvidenceExtraction {
  readonly schemaVersion: "1.0.0";
  readonly artifactSha256: Sha256;
  readonly parserId: string;
  readonly parserVersion: string;
  readonly status: PassiveExtraction["status"];
  readonly mediaType: string;
  readonly machineText: string;
  readonly metadata: PassiveExtraction["metadata"];
  readonly limitations: readonly string[];
  readonly riskIndicators: readonly string[];
  readonly extractionContentSha256: Sha256;
}

export interface EvidenceExtractionPointer {
  readonly extractionContentSha256: Sha256;
  readonly writtenAt: UtcTimestamp | null;
}

interface EvidenceExtractionError {
  readonly code: "INVALID_EVIDENCE_EXTRACTION";
  readonly message: string;
}

type EvidenceExtractionPayload = Omit<
  EvidenceExtraction,
  "extractionContentSha256"
>;

export async function createEvidenceExtraction(
  artifactSha256: Sha256,
  extraction: PassiveExtraction,
): Promise<EvidenceExtraction> {
  const payload: EvidenceExtractionPayload = {
    schemaVersion: "1.0.0",
    artifactSha256,
    parserId: extraction.parserId,
    parserVersion: extraction.parserVersion,
    status: extraction.status,
    mediaType: extraction.mediaType,
    machineText: extraction.text,
    metadata: extraction.metadata,
    limitations: extraction.limitations,
    riskIndicators: extraction.riskIndicators,
  };
  return Object.freeze({
    ...payload,
    extractionContentSha256: asSha256(
      await hashTyped(payload, { typeName: "EvidenceExtraction" }),
    ),
  });
}

export async function parseEvidenceExtraction(
  value: unknown,
): Promise<Result<EvidenceExtraction, EvidenceExtractionError>> {
  if (!isRecord(value) || value.schemaVersion !== "1.0.0") {
    return invalid("Evidence extraction is not a supported JSON record.");
  }
  if (
    typeof value.artifactSha256 !== "string" ||
    typeof value.extractionContentSha256 !== "string" ||
    typeof value.parserId !== "string" ||
    value.parserId.length === 0 ||
    typeof value.parserVersion !== "string" ||
    value.parserVersion.length === 0 ||
    !isExtractionStatus(value.status) ||
    typeof value.mediaType !== "string" ||
    typeof value.machineText !== "string" ||
    !isRecord(value.metadata) ||
    !isStringArray(value.limitations) ||
    !isStringArray(value.riskIndicators)
  ) {
    return invalid("Evidence extraction structure is invalid.");
  }
  const artifactSha256 = parseSha256(value.artifactSha256);
  const extractionContentSha256 = parseSha256(value.extractionContentSha256);
  if (!artifactSha256.ok || !extractionContentSha256.ok) {
    return invalid("Evidence extraction identity is invalid.");
  }
  const extraction = value as unknown as EvidenceExtraction;
  const { extractionContentSha256: ignored, ...payload } = extraction;
  void ignored;
  try {
    if (
      asSha256(await hashTyped(payload, { typeName: "EvidenceExtraction" })) !==
      extractionContentSha256.value
    ) {
      return invalid("Evidence extraction content hash does not match.");
    }
  } catch {
    return invalid("Evidence extraction content hash could not be verified.");
  }
  return { ok: true, value: extraction };
}

export function parseEvidenceExtractionPointer(
  value: unknown,
): Result<EvidenceExtractionPointer, EvidenceExtractionError> {
  if (!isRecord(value) || typeof value.extractionContentSha256 !== "string") {
    return invalid("Evidence extraction pointer is invalid.");
  }
  const extractionContentSha256 = parseSha256(value.extractionContentSha256);
  if (!extractionContentSha256.ok) {
    return invalid("Evidence extraction pointer hash is invalid.");
  }
  let writtenAt: UtcTimestamp | null = null;
  if (value.writtenAt !== null && value.writtenAt !== undefined) {
    if (typeof value.writtenAt !== "string") {
      return invalid("Evidence extraction pointer timestamp is invalid.");
    }
    const parsed = parseUtcTimestamp(value.writtenAt);
    if (!parsed.ok) {
      return invalid("Evidence extraction pointer timestamp is invalid.");
    }
    writtenAt = parsed.value;
  }
  return {
    ok: true,
    value: {
      extractionContentSha256: extractionContentSha256.value,
      writtenAt,
    },
  };
}

function isExtractionStatus(
  value: unknown,
): value is PassiveExtraction["status"] {
  return (
    value === "success" ||
    value === "partial" ||
    value === "unsupported" ||
    value === "unreadable" ||
    value === "blocked" ||
    value === "failed"
  );
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asSha256(value: string): Sha256 {
  const parsed = parseSha256(value);
  if (!parsed.ok) throw new Error("Evidence extraction SHA-256 is invalid.");
  return parsed.value;
}

function invalid(
  message: string,
): Result<never, EvidenceExtractionError> {
  return {
    ok: false,
    error: { code: "INVALID_EVIDENCE_EXTRACTION", message },
  };
}
