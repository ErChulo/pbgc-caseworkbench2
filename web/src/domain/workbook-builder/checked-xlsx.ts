import { canonicalize, hashTyped } from "../manifests/canonical-json";
import { generateValidationEvidence } from "../validation-reconciliation/evidence-generation";
import { computeWorkbookContentHash } from "./workbook-hash";
import { sha256Bytes } from "../shared/digest";
import {
  parseSha256,
  parseUtcTimestamp,
  parseUuid,
  type Sha256,
  type UtcTimestamp,
  type Uuid,
} from "../shared/types";
import { validateWorkbook } from "../validation-reconciliation/structural-validator";
import type { WorkbookValidationEvidence } from "../validation-reconciliation/models";
import type { V1Workbook } from "./models";
import { buildXLSXSpec, writeXLSXBytes } from "./serialization";
import { preflightXlsxSpec, verifyGeneratedXlsx } from "./xlsx-readback";

export type CheckedXlsxResult =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array<ArrayBuffer>;
      readonly sha256: Sha256;
      readonly modelValidation: WorkbookValidationEvidence;
      readonly diagnostic: EncodedWorkbookDiagnostic;
    }
  | {
      readonly ok: false;
      readonly message: string;
      readonly diagnostic?: EncodedWorkbookDiagnostic;
    };

/** Generates and checks in-memory output; no external execution or approval is implied. */
export async function buildCheckedXlsx(
  supplied: V1Workbook,
  validatorVersion: string,
  validatedAt: UtcTimestamp,
): Promise<CheckedXlsxResult> {
  let workbook: V1Workbook;
  let validation: WorkbookValidationEvidence;
  try {
    workbook = structuredClone(supplied);
    if (!validatorVersion.trim() || !parseUtcTimestamp(validatedAt).ok)
      return { ok: false, message: "Model validation metadata is invalid." };
    validation = await validateWorkbook({
      workbook,
      validatorVersion,
      validatedAt,
    });
  } catch {
    return {
      ok: false,
      message: "The workbook model could not be checked safely.",
    };
  }
  const blocked = async (
    message: string,
    outcome: DiagnosticOutcome,
  ): Promise<CheckedXlsxResult> => {
    try {
      const diagnostic = await createWorkbookDiagnostic({
        workbook,
        validation,
        outcome,
        blockedReason: message,
        generatedXlsxSha256: null,
        generatedXlsxSizeBytes: null,
      });
      return { ok: false, message, diagnostic };
    } catch {
      return {
        ok: false,
        message: `${message} The local diagnostic could not be produced safely.`,
      };
    }
  };
  if (validation.status !== "valid") {
    const codes = [
      ...new Set(
        [...validation.errors, ...validation.warnings].map(
          (finding) => finding.code,
        ),
      ),
    ]
      .sort()
      .join(", ");
    return blocked(
      `Workbook model checks blocked output: ${codes || "validation incomplete"}.`,
      "model-findings",
    );
  }
  let bytes: Uint8Array;
  let spec: ReturnType<typeof buildXLSXSpec>;
  try {
    spec = buildXLSXSpec(workbook);
    const preflight = preflightXlsxSpec(spec);
    if (!preflight.ok)
      return await blocked(preflight.message, "preflight-blocked");
    bytes = writeXLSXBytes(spec);
  } catch {
    return blocked(
      "The workbook could not be generated safely.",
      "serialization-failed",
    );
  }
  try {
    const readback = verifyGeneratedXlsx(spec, bytes);
    if (!readback.ok)
      return await blocked(
        `Generated workbook read-back blocked: ${readback.message}`,
        "readback-failed",
      );
  } catch {
    return blocked(
      "Generated workbook read-back could not be completed safely.",
      "readback-failed",
    );
  }
  const stableBytes = new Uint8Array(bytes);
  let sha256: Sha256;
  try {
    sha256 = await sha256Bytes(stableBytes);
  } catch {
    return blocked(
      "The generated workbook could not be hashed safely.",
      "digest-failed",
    );
  }
  try {
    const diagnostic = await createWorkbookDiagnostic({
      workbook,
      validation,
      outcome: "model-and-readback-consistent",
      blockedReason: null,
      generatedXlsxSha256: sha256,
      generatedXlsxSizeBytes: stableBytes.length,
    });
    return {
      ok: true,
      bytes: stableBytes,
      sha256,
      modelValidation: validation,
      diagnostic,
    };
  } catch {
    return {
      ok: false,
      message: "The local workbook diagnostic could not be produced safely.",
    };
  }
}

export type DiagnosticOutcome =
  | "model-findings"
  | "preflight-blocked"
  | "serialization-failed"
  | "readback-failed"
  | "digest-failed"
  | "model-and-readback-consistent";

export interface ProvisionalWorkbookDiagnostic {
  readonly schemaVersion: "1.0.0";
  readonly kind: "provisional-workbook-diagnostic";
  readonly caseId: Uuid;
  readonly recordedWorkbookContentSha256: Sha256;
  readonly validation: WorkbookValidationEvidence;
  readonly validationEvidenceContentSha256: Sha256;
  readonly outcome: DiagnosticOutcome;
  readonly blockedReason: string | null;
  readonly readbackMethod: "sheetjs-generated-spec-v1";
  readonly readbackStatus: "not-run" | "failed" | "passed";
  readonly generatedXlsxSha256: Sha256 | null;
  readonly generatedXlsxSizeBytes: number | null;
  readonly limitations: readonly string[];
  readonly diagnosticContentSha256: Sha256;
}

export interface EncodedWorkbookDiagnostic {
  readonly diagnostic: ProvisionalWorkbookDiagnostic;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly bytesSha256: Sha256;
}

/** Local diagnostics report consistency only; they are not release evidence. */
async function createWorkbookDiagnostic(input: {
  readonly workbook: V1Workbook;
  readonly validation: WorkbookValidationEvidence;
  readonly outcome: DiagnosticOutcome;
  readonly blockedReason: string | null;
  readonly generatedXlsxSha256: Sha256 | null;
  readonly generatedXlsxSizeBytes: number | null;
}): Promise<EncodedWorkbookDiagnostic> {
  const workbook = structuredClone(input.workbook);
  const caseId = workbook.caseId;
  const recordedWorkbookContentSha256 = workbook.workbookContentSha256;
  const validation = structuredClone(input.validation);
  const {
    outcome,
    blockedReason,
    generatedXlsxSha256,
    generatedXlsxSizeBytes,
  } = input;
  const successful = outcome === "model-and-readback-consistent";
  if (
    !parseUuid(caseId).ok ||
    !parseSha256(recordedWorkbookContentSha256).ok ||
    ![
      "model-findings",
      "preflight-blocked",
      "serialization-failed",
      "readback-failed",
      "digest-failed",
      "model-and-readback-consistent",
    ].includes(outcome) ||
    (successful &&
      (blockedReason !== null ||
        validation.status !== "valid" ||
        generatedXlsxSha256 === null ||
        !parseSha256(generatedXlsxSha256).ok ||
        generatedXlsxSizeBytes === null ||
        !Number.isSafeInteger(generatedXlsxSizeBytes) ||
        generatedXlsxSizeBytes <= 0 ||
        validation.workbookContentSha256 !== recordedWorkbookContentSha256)) ||
    (!successful &&
      (typeof blockedReason !== "string" ||
        blockedReason.trim() === "" ||
        blockedReason.length > 4_096 ||
        generatedXlsxSha256 !== null ||
        generatedXlsxSizeBytes !== null)) ||
    (outcome === "model-findings" && validation.status === "valid") ||
    (outcome !== "model-findings" && validation.status !== "valid")
  )
    throw new Error("Diagnostic binding is invalid.");
  if (
    (await computeWorkbookContentHash(workbook)) !==
    validation.workbookContentSha256
  )
    throw new Error("The validation does not match the workbook model.");
  const evidence = await generateValidationEvidence(validation);
  const payload = {
    schemaVersion: "1.0.0" as const,
    kind: "provisional-workbook-diagnostic" as const,
    caseId,
    recordedWorkbookContentSha256,
    validation,
    validationEvidenceContentSha256: evidence.hash,
    outcome,
    blockedReason,
    readbackMethod: "sheetjs-generated-spec-v1" as const,
    readbackStatus:
      successful || outcome === "digest-failed"
        ? ("passed" as const)
        : outcome === "readback-failed"
          ? ("failed" as const)
          : ("not-run" as const),
    generatedXlsxSha256,
    generatedXlsxSizeBytes,
    limitations: [
      "Local model and serialization checks are not independent calculation or execution.",
      "Source authority, actuarial correctness, reviewer authority and release approval are not established.",
      "This diagnostic is not reconciliation or final casework output evidence.",
    ],
  };
  const hash = parseSha256(
    await hashTyped(payload, { typeName: "ProvisionalWorkbookDiagnostic" }),
  );
  if (!hash.ok) throw new Error("Diagnostic hash is invalid.");
  const diagnostic = { ...payload, diagnosticContentSha256: hash.value };
  const bytes = new TextEncoder().encode(`${canonicalize(diagnostic)}\n`);
  if (bytes.length > 8 * 1024 * 1024)
    throw new Error("Diagnostic exceeds the supported size.");
  return { diagnostic, bytes, bytesSha256: await sha256Bytes(bytes) };
}
