import { sha256Bytes } from "../shared/digest";
import {
  parseUtcTimestamp,
  type Sha256,
  type UtcTimestamp,
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
    }
  | { readonly ok: false; readonly message: string };

/** Generates and checks in-memory output; no external execution or approval is implied. */
export async function buildCheckedXlsx(
  supplied: V1Workbook,
  validatorVersion: string,
  validatedAt: UtcTimestamp,
): Promise<CheckedXlsxResult> {
  try {
    const workbook = structuredClone(supplied);
    if (!validatorVersion.trim() || !parseUtcTimestamp(validatedAt).ok)
      return { ok: false, message: "Model validation metadata is invalid." };
    const validation = await validateWorkbook({
      workbook,
      validatorVersion,
      validatedAt,
    });
    if (validation.status !== "valid") {
      const codes = [...validation.errors, ...validation.warnings]
        .map((finding) => finding.code)
        .join(", ");
      return {
        ok: false,
        message: `Workbook model checks blocked output: ${codes || "validation incomplete"}.`,
      };
    }
    const spec = buildXLSXSpec(workbook);
    const preflight = preflightXlsxSpec(spec);
    if (!preflight.ok) return preflight;
    const bytes = writeXLSXBytes(spec);
    const readback = verifyGeneratedXlsx(spec, bytes);
    if (!readback.ok)
      return {
        ok: false,
        message: `Generated workbook read-back blocked: ${readback.message}`,
      };
    const stableBytes = new Uint8Array(bytes);
    return {
      ok: true,
      bytes: stableBytes,
      sha256: await sha256Bytes(stableBytes),
      modelValidation: validation,
    };
  } catch {
    return {
      ok: false,
      message: "The workbook could not be generated and checked safely.",
    };
  }
}
