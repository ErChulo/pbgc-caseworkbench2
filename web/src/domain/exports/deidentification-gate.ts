import {
  validateContract,
  type ContractValidationIssue,
} from "../../contracts/schema-validator";
import { hashTyped } from "../manifests/canonical-json";
import type { Result, Sha256 } from "../shared/types";

export type ExportMode = "de-identified-real-data" | "synthetic-mock-data";

export interface DeidentifiedEnvelope {
  readonly schemaVersion: "1.0.0";
  readonly deterministicPayload: Readonly<Record<string, unknown>>;
  readonly deterministicPayloadSha256: Sha256;
  readonly operationalMetadata: Readonly<Record<string, unknown>>;
}

export interface ExportGateError {
  readonly code:
    | "CONTRACT_INVALID"
    | "HASH_MISMATCH"
    | "DISALLOWED_FIELD"
    | "IDENTIFIER_PRESENT"
    | "APPROVAL_INVALID";
  readonly safeMessage: string;
  readonly issues: readonly ContractValidationIssue[];
}

const prohibitedNames = new Set(
  [
    "name",
    "firstname",
    "middlename",
    "lastname",
    "fullname",
    "ssn",
    "socialsecuritynumber",
    "address",
    "streetaddress",
    "email",
    "phone",
    "telephone",
    "employeeid",
    "participantid",
  ].map((value) => value.toLowerCase()),
);

export async function validateDeidentifiedPackage(
  envelope: DeidentifiedEnvelope,
): Promise<Result<DeidentifiedEnvelope, ExportGateError>> {
  const contract = validateContract(
    "deidentified-export.schema.json",
    envelope,
  );
  if (!contract.valid) {
    return failure(
      "CONTRACT_INVALID",
      "Export package does not satisfy the governed contract.",
      contract.issues,
    );
  }
  const hash = await hashTyped(envelope.deterministicPayload, {
    schemaId: "deidentified-export.schema.json",
  });
  if (hash !== envelope.deterministicPayloadSha256) {
    return failure(
      "HASH_MISMATCH",
      "Export payload hash does not match its deterministic content.",
    );
  }
  const payload = envelope.deterministicPayload;
  const allowlist = new Set(
    Array.isArray(payload.allowedOutputFields)
      ? payload.allowedOutputFields.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );
  const records: unknown[] = Array.isArray(payload.records)
    ? (payload.records as unknown[])
    : [];
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return failure(
        "CONTRACT_INVALID",
        "Export record is not a governed object.",
      );
    }
    const recordValue = record as Record<string, unknown>;
    for (const key of Object.keys(recordValue)) {
      if (prohibitedNames.has(key.toLowerCase())) {
        return failure(
          "IDENTIFIER_PRESENT",
          "A prohibited direct or indirect identifier is present.",
        );
      }
      if (!allowlist.has(key)) {
        return failure(
          "DISALLOWED_FIELD",
          "An export field is outside the approved allowlist.",
        );
      }
    }
  }
  if (payload.exportMode === "de-identified-real-data") {
    const metadata = envelope.operationalMetadata;
    const history: unknown[] = Array.isArray(metadata.humanApprovalHistory)
      ? (metadata.humanApprovalHistory as unknown[])
      : [];
    const effective = history.at(-1);
    if (
      !isRecord(effective) ||
      effective.decision !== "approved" ||
      effective.deterministicPayloadSha256 !==
        envelope.deterministicPayloadSha256 ||
      !isRecord(effective.actor) ||
      effective.actor.actorType !== "human"
    ) {
      return failure(
        "APPROVAL_INVALID",
        "De-identified real-data export lacks exact-payload human approval.",
      );
    }
  }
  return { ok: true, value: envelope };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface LocalExportStore {
  createImmutable(path: string, bytes: Uint8Array): Promise<boolean>;
  read(path: string): Promise<Uint8Array | null>;
}

export async function buildLocalPackage(
  deterministicPayload: Readonly<Record<string, unknown>>,
  operationalMetadataForHash: (
    deterministicPayloadSha256: Sha256,
  ) => Readonly<Record<string, unknown>>,
): Promise<DeidentifiedEnvelope> {
  const digest = await hashTyped(deterministicPayload, {
    schemaId: "deidentified-export.schema.json",
  });
  const parsed = parseDigest(digest);
  return Object.freeze({
    schemaVersion: "1.0.0",
    deterministicPayload,
    deterministicPayloadSha256: parsed,
    operationalMetadata: operationalMetadataForHash(parsed),
  });
}

export async function storeValidatedPackage(
  store: LocalExportStore,
  path: string,
  envelope: DeidentifiedEnvelope,
): Promise<Result<string, ExportGateError>> {
  const validated = await validateDeidentifiedPackage(envelope);
  if (!validated.ok) return validated;
  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  const written = await store.createImmutable(path, bytes);
  if (!written)
    return failure(
      "CONTRACT_INVALID",
      "Validated export could not be stored immutably.",
    );
  return { ok: true, value: path };
}

export async function importLocalPackage(
  store: LocalExportStore,
  path: string,
): Promise<Result<DeidentifiedEnvelope, ExportGateError>> {
  const bytes = await store.read(path);
  if (bytes === null)
    return failure("CONTRACT_INVALID", "Local export package was not found.");
  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (!isRecord(value))
      return failure(
        "CONTRACT_INVALID",
        "Local export package is not an object.",
      );
    return await validateDeidentifiedPackage(
      value as unknown as DeidentifiedEnvelope,
    );
  } catch {
    return failure(
      "CONTRACT_INVALID",
      "Local export package is not valid UTF-8 JSON.",
    );
  }
}

function parseDigest(value: string): Sha256 {
  if (!/^[a-f0-9]{64}$/u.test(value))
    throw new Error("Internal deterministic SHA-256 generation failed.");
  return value as Sha256;
}

function failure(
  code: ExportGateError["code"],
  safeMessage: string,
  issues: readonly ContractValidationIssue[] = [],
): Result<never, ExportGateError> {
  return { ok: false, error: { code, safeMessage, issues } };
}
