import { validateContract } from "../../contracts/schema-validator";
import type { Result, Sha256, Uuid, UtcTimestamp } from "../shared/types";
import type {
  CellDescriptor,
  FormulaDependency,
  IoBValue,
  NamedRange,
  RunJustification,
  RunDescriptor,
  SourceTab,
  V1Architecture,
  V1ArchitectureContent,
} from "./models";
import type { ArchitectureSchemaVersion } from "./models";

export interface ArchitectureWorkspace {
  readonly writeArchitecture: (
    architecture: V1Architecture,
  ) => Promise<Result<ArchitectureWriteReceipt, ArchitectureWriteError>>;
  readonly readArchitecture: (
    architectureId: Uuid,
  ) => Promise<Result<V1Architecture, ArchitectureReadError>>;
  readonly listArchitectures: (
    caseId: Uuid,
  ) => Promise<Result<readonly ArchitectureSummary[], ArchitectureReadError>>;
}

export interface ArchitectureWriteReceipt {
  readonly architectureId: Uuid;
  readonly sizeBytes: number;
}

export interface ArchitectureReadError {
  readonly code:
    | "NOT_FOUND"
    | "READ_FAILED"
    | "PARSE_ERROR"
    | "VALIDATION_ERROR"
    | "HASH_MISMATCH";
  readonly message: string;
}

export interface ArchitectureWriteError {
  readonly code: "WRITE_FAILED" | "VALIDATION_ERROR";
  readonly message: string;
}

export interface ArchitectureSummary {
  readonly architectureId: Uuid;
  readonly builtAt: string;
  readonly schemaVersion: string;
  readonly sourceTabCount: number;
  readonly runCount: number;
  readonly cellCount: number;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "string" ||
    typeof error === "number" ||
    typeof error === "boolean"
  ) {
    return String(error);
  }
  return "Unknown error";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function architectureToJsonValue(
  architecture: V1Architecture,
): Readonly<Record<string, unknown>> {
  return {
    architectureId: architecture.architectureId,
    builtAt: architecture.builtAt,
    ...architectureContentToJsonValue(architecture),
    architectureContentSha256: architecture.architectureContentSha256,
  };
}

export function architectureContentToJsonValue(
  architecture: V1ArchitectureContent,
): Readonly<Record<string, unknown>> {
  return {
    caseId: architecture.caseId,
    schemaVersion: architecture.schemaVersion,
    ruleSetVersion: architecture.ruleSetVersion,
    lineage: architecture.lineage,
    sourceTabs: architecture.sourceTabs,
    runs: architecture.runs,
    cells: Object.fromEntries(
      [...architecture.cells]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, cell]) => [
          key,
          {
            ...cell,
            perRunClassification: Object.fromEntries(
              [...cell.perRunClassification].sort(([left], [right]) =>
                left.localeCompare(right),
              ),
            ),
          },
        ]),
    ),
    formulaDependencies: architecture.formulaDependencies,
    namedRanges: architecture.namedRanges,
  };
}

export function computeArchitectureContentSha256(
  architecture: V1ArchitectureContent,
): Sha256 {
  const bytes = new TextEncoder().encode(
    stableJson(architectureContentToJsonValue(architecture)),
  );
  const { createHash } = requireNodeCrypto();
  return createHash("sha256").update(bytes).digest("hex") as Sha256;
}

function requireNodeCrypto(): {
  createHash: (algorithm: string) => {
    update: (data: Uint8Array) => { digest: (encoding: "hex") => string };
  };
} {
  const processValue = (globalThis as { process?: unknown }).process as
    { getBuiltinModule?: (name: string) => unknown } | undefined;
  const crypto =
    processValue !== undefined &&
    typeof processValue.getBuiltinModule === "function"
      ? processValue.getBuiltinModule("node:crypto")
      : undefined;
  if (crypto === undefined) throw new Error("Node crypto is unavailable.");
  return crypto as {
    createHash: (algorithm: string) => {
      update: (data: Uint8Array) => { digest: (encoding: "hex") => string };
    };
  };
}

function readRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, name: string): string {
  if (typeof value !== "string")
    throw new TypeError(`${name} must be a string`);
  return value;
}

function readNumber(value: unknown, name: string): number {
  if (typeof value !== "number")
    throw new TypeError(`${name} must be a number`);
  return value;
}

function readBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean")
    throw new TypeError(`${name} must be a boolean`);
  return value;
}

function readArray(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value;
}

function readNullableString(value: unknown, name: string): string | null {
  return value === null ? null : readString(value, name);
}

function readNullableSha256(value: unknown, name: string): Sha256 | null {
  return value === null ? null : (readString(value, name) as Sha256);
}

function readStringArray(value: unknown, name: string): readonly string[] {
  return readArray(value, name).map((item, index) =>
    readString(item, `${name}[${String(index)}]`),
  );
}

function readSourceTab(value: unknown, index: number): SourceTab {
  const name = `sourceTabs[${String(index)}]`;
  const tab = readRecord(value, name);
  const role = readString(tab.role, `${name}.role`);
  if (role !== "population" && role !== "support")
    throw new TypeError(`${name}.role is invalid`);
  return {
    tabName: readString(tab.tabName, `${name}.tabName`),
    role,
    workbookProfileContentSha256: readString(
      tab.workbookProfileContentSha256,
      `${name}.workbookProfileContentSha256`,
    ) as Sha256,
    populationCandidateKey: readNullableSha256(
      tab.populationCandidateKey,
      `${name}.populationCandidateKey`,
    ),
    populationArtifactSha256: readNullableSha256(
      tab.populationArtifactSha256,
      `${name}.populationArtifactSha256`,
    ),
    fieldCount: readNumber(tab.fieldCount, `${name}.fieldCount`),
    recordCount: readNumber(tab.recordCount, `${name}.recordCount`),
  };
}

function readRun(value: unknown, index: number): RunDescriptor {
  const name = `runs[${String(index)}]`;
  const run = readRecord(value, name);
  const range = readRecord(
    run.effectiveDateRange,
    `${name}.effectiveDateRange`,
  );
  const justifications = readArray(
    run.justifications,
    `${name}.justifications`,
  ).map((value, justificationIndex): RunJustification => {
    const justificationName = `${name}.justifications[${String(justificationIndex)}]`;
    const justification = readRecord(value, justificationName);
    const source = readString(
      justification.source,
      `${justificationName}.source`,
    );
    if (
      source !== "plan-rule" &&
      source !== "case-control" &&
      source !== "population"
    )
      throw new TypeError(`${justificationName}.source is invalid`);
    return {
      source,
      referenceId: readString(
        justification.referenceId,
        `${justificationName}.referenceId`,
      ),
      referenceContentSha256: readString(
        justification.referenceContentSha256,
        `${justificationName}.referenceContentSha256`,
      ) as Sha256,
    };
  });
  return {
    runId: readString(run.runId, `${name}.runId`),
    runLabel: readString(run.runLabel, `${name}.runLabel`),
    effectiveDateRange: {
      startDate: readString(
        range.startDate,
        `${name}.effectiveDateRange.startDate`,
      ),
      endDate: readNullableString(
        range.endDate,
        `${name}.effectiveDateRange.endDate`,
      ),
    },
    justifications,
    applicableTabs: readStringArray(
      run.applicableTabs,
      `${name}.applicableTabs`,
    ),
  };
}

function readIoB(value: unknown, name: string): IoBValue {
  const iob = readString(value, name);
  if (!["I", "O", "B", "N", "P", ""].includes(iob)) {
    throw new TypeError(`${name} is invalid`);
  }
  return iob as IoBValue;
}

function readCell(value: unknown, key: string): CellDescriptor {
  const name = `cells.${key}`;
  const cell = readRecord(value, name);
  const serializedClassifications = readRecord(
    cell.perRunClassification,
    `${name}.perRunClassification`,
  );
  const perRunClassification = new Map(
    Object.entries(serializedClassifications).map(([runId, item]) => {
      const classification = readRecord(
        item,
        `${name}.perRunClassification.${runId}`,
      );
      return [
        runId,
        {
          runId: readString(
            classification.runId,
            `${name}.perRunClassification.${runId}.runId`,
          ),
          iob: readIoB(
            classification.iob,
            `${name}.perRunClassification.${runId}.iob`,
          ),
          justification: readString(
            classification.justification,
            `${name}.perRunClassification.${runId}.justification`,
          ),
          ruleVersion: readString(
            classification.ruleVersion,
            `${name}.perRunClassification.${runId}.ruleVersion`,
          ),
        },
      ] as const;
    }),
  );
  return {
    key: readString(cell.key, `${name}.key`),
    sourceTab: readString(cell.sourceTab, `${name}.sourceTab`),
    cellAddress: readString(cell.cellAddress, `${name}.cellAddress`),
    genericField: readString(cell.genericField, `${name}.genericField`),
    description: readString(cell.description, `${name}.description`),
    hasFormula: readBoolean(cell.hasFormula, `${name}.hasFormula`),
    formulaText: readNullableString(cell.formulaText, `${name}.formulaText`),
    perRunClassification,
  };
}

function readFormulaDependency(
  value: unknown,
  index: number,
): FormulaDependency {
  const name = `formulaDependencies[${String(index)}]`;
  const dependency = readRecord(value, name);
  const referenceType = readString(
    dependency.referenceType,
    `${name}.referenceType`,
  );
  if (
    referenceType !== "cell" &&
    referenceType !== "named-range" &&
    referenceType !== "external"
  ) {
    throw new TypeError(`${name}.referenceType is invalid`);
  }
  return {
    dependentKey: readString(dependency.dependentKey, `${name}.dependentKey`),
    dependencyKey: readString(
      dependency.dependencyKey,
      `${name}.dependencyKey`,
    ),
    runId: readString(dependency.runId, `${name}.runId`),
    referenceType,
  };
}

function readNamedRange(value: unknown, index: number): NamedRange {
  const name = `namedRanges[${String(index)}]`;
  const range = readRecord(value, name);
  const scope = readString(range.scope, `${name}.scope`);
  if (scope !== "workbook" && scope !== "sheet") {
    throw new TypeError(`${name}.scope is invalid`);
  }
  return {
    name: readString(range.name, `${name}.name`),
    cellAddress: readString(range.cellAddress, `${name}.cellAddress`),
    sourceTab: readString(range.sourceTab, `${name}.sourceTab`),
    scope,
    genericField: readNullableString(
      range.genericField,
      `${name}.genericField`,
    ),
  };
}

export function writeArchitectureJson(
  architecture: V1Architecture,
): Promise<Result<Uint8Array, ArchitectureWriteError>> {
  try {
    const serializable = architectureToJsonValue(architecture);
    const validation = validateContract("v1Architecture", serializable);
    if (!validation.valid) {
      return Promise.resolve({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: validation.issues.map((issue) => issue.message).join("; "),
        },
      });
    }
    if (
      computeArchitectureContentSha256(architecture) !==
      architecture.architectureContentSha256
    ) {
      return Promise.resolve({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Architecture content hash does not match its content.",
        },
      });
    }

    const json = `${JSON.stringify(serializable, null, 2)}\n`;
    const bytes = new TextEncoder().encode(json);
    return Promise.resolve({ ok: true, value: bytes });
  } catch (error) {
    return Promise.resolve({
      ok: false,
      error: {
        code: "WRITE_FAILED",
        message: errorMessage(error),
      },
    });
  }
}

export function readArchitectureJson(
  bytes: Uint8Array,
): Promise<Result<V1Architecture, ArchitectureReadError>> {
  try {
    const json = new TextDecoder().decode(bytes);
    const parsed: unknown = JSON.parse(json);
    const data = readRecord(parsed, "architecture");
    const validation = validateContract("v1Architecture", data);
    if (!validation.valid) {
      return Promise.resolve({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: validation.issues.map((issue) => issue.message).join("; "),
        },
      });
    }
    const cells = new Map<string, CellDescriptor>();
    for (const [key, value] of Object.entries(
      readRecord(data.cells, "cells"),
    )) {
      cells.set(key, readCell(value, key));
    }

    const architecture: V1Architecture = {
      architectureId: readString(data.architectureId, "architectureId") as Uuid,
      caseId: readString(data.caseId, "caseId") as Uuid,
      builtAt: readString(data.builtAt, "builtAt") as UtcTimestamp,
      schemaVersion: readString(
        data.schemaVersion,
        "schemaVersion",
      ) as ArchitectureSchemaVersion,
      ruleSetVersion: readString(data.ruleSetVersion, "ruleSetVersion"),
      lineage: data.lineage as V1Architecture["lineage"],
      sourceTabs: readArray(data.sourceTabs, "sourceTabs").map(readSourceTab),
      runs: readArray(data.runs, "runs").map(readRun),
      cells,
      formulaDependencies: readArray(
        data.formulaDependencies,
        "formulaDependencies",
      ).map(readFormulaDependency),
      namedRanges: readArray(data.namedRanges, "namedRanges").map(
        readNamedRange,
      ),
      architectureContentSha256: readString(
        data.architectureContentSha256,
        "architectureContentSha256",
      ) as Sha256,
    };

    if (
      computeArchitectureContentSha256(architecture) !==
      architecture.architectureContentSha256
    ) {
      return Promise.resolve({
        ok: false,
        error: {
          code: "HASH_MISMATCH",
          message: "Stored architecture content hash is invalid.",
        },
      });
    }
    return Promise.resolve({ ok: true, value: architecture });
  } catch (error) {
    return Promise.resolve({
      ok: false,
      error: {
        code: "PARSE_ERROR",
        message: errorMessage(error),
      },
    });
  }
}
