import { canonicalize, hashTyped } from "../manifests/canonical-json";
import { sha256Bytes } from "../shared/digest";
import {
  parseSha256,
  parseUuid,
  type Sha256,
  type Uuid,
} from "../shared/types";
import type { V1Workbook } from "../workbook-builder/models";
import { computeWorkbookContentHash } from "../workbook-builder/workbook-hash";
import { parseRuntimeResults, parseValToolResults } from "./oracle-integration";
import type { OracleFormulaResult } from "./models";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
export type ProvisionalOracleFormat =
  "workbench-jsonl-v1" | "workbench-json-v1";

/** A proposal, not an execution record or authority to approve a formula. */
export interface ProvisionalOracleEvidence {
  readonly schemaVersion: "1.0.0";
  readonly kind: "provisional-oracle-evidence";
  readonly caseId: Uuid;
  readonly format: ProvisionalOracleFormat;
  readonly sourceBytesSha256: Sha256;
  readonly sourceSizeBytes: number;
  readonly associatedWorkbookContentSha256: Sha256;
  readonly associatedBuildSpecContentSha256: Sha256;
  readonly associatedPopulationProfileContentSha256: Sha256;
  readonly results: readonly OracleFormulaResult[];
  readonly missingFormulaIds: readonly string[];
  readonly failedFormulaIds: readonly string[];
  readonly status: "complete-proposal" | "incomplete-proposal";
  readonly evidenceContentSha256: Sha256;
}

export async function createProvisionalOracleEvidence(input: {
  readonly caseId: Uuid;
  readonly workbook: V1Workbook;
  readonly sourceBytes: Uint8Array;
  readonly format: ProvisionalOracleFormat;
}): Promise<
  | { readonly ok: true; readonly evidence: ProvisionalOracleEvidence }
  | { readonly ok: false; readonly message: string }
> {
  const failure = (message: string) => ({ ok: false as const, message });
  try {
    const bytes = new Uint8Array(input.sourceBytes);
    const workbook = structuredClone(input.workbook);
    const format: string = (input as { readonly format: string }).format;
    if (!parseUuid(input.caseId).ok || workbook.caseId !== input.caseId)
      return failure("The workbook must belong to the active case.");
    if (bytes.length === 0 || bytes.length > MAX_INPUT_BYTES)
      return failure("Oracle input is empty or exceeds the supported size.");
    if (format !== "workbench-jsonl-v1" && format !== "workbench-json-v1")
      return failure("Oracle interchange format is unsupported.");
    if (
      !parseSha256(workbook.workbookContentSha256).ok ||
      !parseSha256(workbook.buildSpecContentSha256).ok ||
      !parseSha256(workbook.populationProfileContentSha256).ok ||
      (await computeWorkbookContentHash(workbook)) !==
        workbook.workbookContentSha256
    )
      return failure("The associated workbook identity is invalid.");
    const formulas = new Map(
      workbook.formulaCells.map((formula) => [formula.formulaId, formula]),
    );
    if (
      formulas.size !== workbook.formulaCells.length ||
      formulas.size === 0 ||
      workbook.formulaCells.some(
        (formula) =>
          typeof formula.formulaId !== "string" ||
          formula.formulaId.trim() === "" ||
          typeof formula.cellAddress !== "string" ||
          formula.cellAddress.trim() === "",
      )
    )
      return failure("The workbook must contain uniquely identified formulas.");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const results =
      format === "workbench-jsonl-v1"
        ? parseValToolResults(text)
        : parseRuntimeResults(text);
    if (results.length === 0)
      return failure("Oracle input contains no formula results.");
    for (const result of results) {
      const formula = formulas.get(result.formulaId);
      if (result.cellAddress !== formula?.cellAddress)
        return failure(
          "An oracle result does not match an associated workbook formula and cell.",
        );
    }
    const observed = new Set(results.map((result) => result.formulaId));
    const missingFormulaIds = [...formulas.keys()]
      .filter((id) => !observed.has(id))
      .sort();
    const failedFormulaIds = results
      .filter(
        (result) => result.error !== null || result.computedType === "error",
      )
      .map((result) => result.formulaId)
      .sort();
    const payload: Omit<ProvisionalOracleEvidence, "evidenceContentSha256"> = {
      schemaVersion: "1.0.0" as const,
      kind: "provisional-oracle-evidence" as const,
      caseId: input.caseId,
      format,
      sourceBytesSha256: await sha256Bytes(bytes),
      sourceSizeBytes: bytes.length,
      associatedWorkbookContentSha256: workbook.workbookContentSha256,
      associatedBuildSpecContentSha256: workbook.buildSpecContentSha256,
      associatedPopulationProfileContentSha256:
        workbook.populationProfileContentSha256,
      results: results.sort((a, b) =>
        a.formulaId < b.formulaId ? -1 : a.formulaId > b.formulaId ? 1 : 0,
      ),
      missingFormulaIds,
      failedFormulaIds,
      status:
        missingFormulaIds.length === 0 && failedFormulaIds.length === 0
          ? ("complete-proposal" as const)
          : ("incomplete-proposal" as const),
    };
    const hash = parseSha256(
      await hashTyped(payload, { typeName: "ProvisionalOracleEvidence" }),
    );
    if (!hash.ok)
      return failure("Oracle proposal hash could not be calculated.");
    for (const result of payload.results) Object.freeze(result);
    Object.freeze(payload.results);
    Object.freeze(payload.missingFormulaIds);
    Object.freeze(payload.failedFormulaIds);
    return {
      ok: true,
      evidence: Object.freeze({
        ...payload,
        evidenceContentSha256: hash.value,
      }),
    };
  } catch {
    return failure("Oracle input could not be safely parsed and verified.");
  }
}

export async function verifyProvisionalOracleEvidence(input: {
  readonly evidence: ProvisionalOracleEvidence;
  readonly workbook: V1Workbook;
  readonly sourceBytes: Uint8Array;
}): Promise<boolean> {
  try {
    const evidence = structuredClone(input.evidence);
    const reconstructed = await createProvisionalOracleEvidence({
      caseId: evidence.caseId,
      format: evidence.format,
      workbook: input.workbook,
      sourceBytes: input.sourceBytes,
    });
    return (
      reconstructed.ok &&
      canonicalize(reconstructed.evidence) === canonicalize(evidence)
    );
  } catch {
    return false;
  }
}
