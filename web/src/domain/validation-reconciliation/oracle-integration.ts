import { parseUtcTimestamp } from "../shared/types";
import type { ReconciliationOracle, OracleFormulaResult } from "./models";

export interface OracleIntegrationContract {
  readonly oracleId: string;
  readonly oracleType: ReconciliationOracle["oracleType"];
  readonly toolName: ReconciliationOracle["toolName"];
  readonly executedAt: string;
  readonly executionVersion: string;
  readonly populationSnapshot: string;
  readonly buildSpecSnapshot: string;
  readonly results: readonly OracleFormulaResult[];
  readonly reliability: ReconciliationOracle["reliability"];
  readonly executionEvidence: string | null;
}

export function validateOracleContract(
  oracle: OracleIntegrationContract,
): string[] {
  const errors: string[] = [];

  if (typeof oracle.oracleId !== "string" || oracle.oracleId.trim() === "") {
    errors.push("Oracle ID must not be empty.");
  }

  if (
    ![
      "external-execution",
      "reference-calculation",
      "prior-validated-run",
      "independent-oracle",
    ].includes(oracle.oracleType)
  ) {
    errors.push(`Invalid oracle type: ${oracle.oracleType}`);
  }

  if (
    oracle.toolName !== null &&
    !["ValTool", "Runtime", "ATPBGC", "BCV", "Custom"].includes(oracle.toolName)
  )
    errors.push("Oracle tool name is invalid.");
  if (oracle.oracleType === "external-execution" && oracle.toolName === null) {
    errors.push("External execution oracles must specify a tool name.");
  }

  if (
    typeof oracle.executedAt !== "string" ||
    !parseUtcTimestamp(oracle.executedAt).ok
  ) {
    errors.push("Oracle execution timestamp must be a valid UTC timestamp.");
  }

  if (
    typeof oracle.executionVersion !== "string" ||
    oracle.executionVersion.trim() === ""
  ) {
    errors.push("Execution version must not be empty.");
  }

  if (
    typeof oracle.populationSnapshot !== "string" ||
    !/^[a-f0-9]{64}$/u.test(oracle.populationSnapshot)
  ) {
    errors.push("Population snapshot must be a valid SHA-256 hash.");
  }

  if (
    typeof oracle.buildSpecSnapshot !== "string" ||
    !/^[a-f0-9]{64}$/u.test(oracle.buildSpecSnapshot)
  ) {
    errors.push("BuildSpec snapshot must be a valid SHA-256 hash.");
  }

  if (!Array.isArray(oracle.results)) {
    errors.push("Oracle results must be an array.");
  }

  if (!["trusted", "provisional", "unknown"].includes(oracle.reliability)) {
    errors.push(`Invalid reliability level: ${oracle.reliability}`);
  }

  if (
    oracle.executionEvidence !== null &&
    typeof oracle.executionEvidence !== "string"
  )
    errors.push("Execution evidence must be null or a string.");

  if (Array.isArray(oracle.results)) {
    const results: readonly OracleFormulaResult[] = oracle.results;
    for (const [index, result] of results.entries()) {
      const resultErrors = validateOracleFormulaResult(result, index);
      errors.push(...resultErrors);
    }
  }

  return errors;
}

function validateOracleFormulaResult(
  supplied: unknown,
  index: number,
): string[] {
  const errors: string[] = [];
  if (!isRecord(supplied))
    return [`Result[${String(index)}]: Result must be an object.`];
  const result = supplied as unknown as OracleFormulaResult;

  if (
    typeof result.formulaId !== "string" ||
    !result.formulaId ||
    result.formulaId.trim() === ""
  ) {
    errors.push(`Result[${String(index)}]: Formula ID must not be empty.`);
  }

  if (
    typeof result.cellAddress !== "string" ||
    result.cellAddress.trim() === ""
  ) {
    errors.push(`Result[${String(index)}]: Cell address must not be empty.`);
  }

  if (
    !["number", "text", "date", "boolean", "error"].includes(
      result.computedType,
    )
  ) {
    errors.push(
      `Result[${String(index)}]: Invalid computed type: ${result.computedType}`,
    );
  }

  if (result.error !== null && typeof result.error !== "string") {
    errors.push(
      `Result[${String(index)}]: Error field must be null or a string.`,
    );
  }

  if (
    result.precision !== null &&
    (typeof result.precision !== "number" ||
      !Number.isFinite(result.precision) ||
      result.precision < 0)
  ) {
    errors.push(
      `Result[${String(index)}]: Precision must be null or a non-negative number.`,
    );
  }

  return errors;
}

/** Parses the project's provisional JSONL interchange, not a verified vendor format.
 * Malformed records abort the whole import; none may be silently discarded. */
export function parseValToolResults(rawOutput: string): OracleFormulaResult[] {
  const results: OracleFormulaResult[] = [];
  const seen = new Set<string>();
  for (const [index, line] of rawOutput.split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed) as unknown;
    } catch {
      throw new Error(`Oracle JSONL line ${String(index + 1)} is invalid.`);
    }
    const result = parseInterchangeRecord(
      raw,
      "value",
      "error",
      "precision",
      `line ${String(index + 1)}`,
    );
    if (seen.has(result.formulaId))
      throw new Error("Oracle input contains duplicate formula identifiers.");
    seen.add(result.formulaId);
    results.push(result);
  }
  return results;
}

/** Parses the project's provisional JSON interchange, not a verified vendor format. */
export function parseRuntimeResults(rawOutput: string): OracleFormulaResult[] {
  let raw: unknown;
  try {
    raw = JSON.parse(rawOutput) as unknown;
  } catch {
    throw new Error("Oracle JSON is invalid.");
  }
  if (!isRecord(raw) || !Array.isArray(raw.calculations))
    throw new Error("Oracle calculations must be an array.");
  const seen = new Set<string>();
  return (raw.calculations as readonly unknown[]).map((item, index) => {
    const result = parseInterchangeRecord(
      item,
      "result",
      "executionError",
      "decimalPlaces",
      `result ${String(index + 1)}`,
    );
    if (seen.has(result.formulaId))
      throw new Error("Oracle input contains duplicate formula identifiers.");
    seen.add(result.formulaId);
    return result;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInterchangeRecord(
  raw: unknown,
  valueKey: string,
  errorKey: string,
  precisionKey: string,
  label: string,
): OracleFormulaResult {
  if (
    !isRecord(raw) ||
    typeof raw.formulaId !== "string" ||
    raw.formulaId.trim() === "" ||
    typeof raw.cellAddress !== "string" ||
    raw.cellAddress.trim() === "" ||
    !Object.prototype.hasOwnProperty.call(raw, valueKey)
  )
    throw new Error(`Oracle ${label} is missing required fields.`);
  const value = raw[valueKey];
  const error = raw[errorKey] ?? null;
  const precision = raw[precisionKey] ?? null;
  if (
    (error !== null && (typeof error !== "string" || error.trim() === "")) ||
    (precision !== null &&
      (typeof precision !== "number" ||
        !Number.isFinite(precision) ||
        precision < 0))
  )
    throw new Error(`Oracle ${label} has invalid error or precision metadata.`);
  if (
    !(typeof value === "number" && Number.isFinite(value)) &&
    typeof value !== "string" &&
    typeof value !== "boolean" &&
    !(value === null && typeof error === "string")
  )
    throw new Error(`Oracle ${label} has an unsupported value.`);
  if (typeof value === "string" && value.trim() === "" && error === null)
    throw new Error(`Oracle ${label} has an empty value.`);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new Error(`Oracle ${label} has an invalid date.`);
  }
  const computedType: OracleFormulaResult["computedType"] =
    typeof error === "string" ? "error" : classifyType(value);
  return {
    formulaId: raw.formulaId,
    cellAddress: raw.cellAddress,
    computedValue: value,
    computedType,
    error,
    precision,
  };
}

function classifyType(value: unknown): OracleFormulaResult["computedType"] {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") {
    if (value.toLowerCase() === "error" || value.startsWith("#"))
      return "error";
    if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return "date";
  }
  return "text";
}

export interface OracleReliabilityEvaluation {
  readonly isReliable: boolean;
  readonly confidence: "high" | "medium" | "low";
  readonly concerns: readonly string[];
}

export function evaluateOracleReliability(
  oracle: ReconciliationOracle,
): OracleReliabilityEvaluation {
  const concerns: string[] = [];
  let confidence: "high" | "medium" | "low" = "high";

  if (oracle.reliability === "unknown") {
    concerns.push("Oracle reliability status is unknown.");
    confidence = "low";
  } else if (oracle.reliability === "provisional") {
    concerns.push(
      "Oracle is marked as provisional and may require validation.",
    );
    confidence = "medium";
  }

  if (oracle.oracleType === "external-execution" && oracle.toolName === null) {
    concerns.push("External execution oracle lacks tool identification.");
    confidence = "low";
  }

  if (oracle.executionEvidence === null) {
    concerns.push("Oracle lacks execution evidence documentation.");
    if (confidence !== "low") confidence = "medium";
  }

  if (oracle.results.length === 0) {
    concerns.push("Oracle contains no formula results.");
    confidence = "low";
  }

  return {
    isReliable: oracle.reliability !== "unknown" && confidence !== "low",
    confidence,
    concerns,
  };
}
