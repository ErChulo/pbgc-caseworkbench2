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

  if (!oracle.oracleId || oracle.oracleId.trim() === "") {
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

  if (oracle.oracleType === "external-execution" && oracle.toolName === null) {
    errors.push("External execution oracles must specify a tool name.");
  }

  if (!oracle.executedAt || isNaN(new Date(oracle.executedAt).getTime())) {
    errors.push("Oracle execution timestamp must be a valid ISO 8601 date.");
  }

  if (!oracle.executionVersion || oracle.executionVersion.trim() === "") {
    errors.push("Execution version must not be empty.");
  }

  if (oracle.populationSnapshot.length !== 64) {
    errors.push("Population snapshot must be a valid SHA-256 hash.");
  }

  if (oracle.buildSpecSnapshot.length !== 64) {
    errors.push("BuildSpec snapshot must be a valid SHA-256 hash.");
  }

  if (!Array.isArray(oracle.results)) {
    errors.push("Oracle results must be an array.");
  }

  if (!["trusted", "provisional", "unknown"].includes(oracle.reliability)) {
    errors.push(`Invalid reliability level: ${oracle.reliability}`);
  }

  for (const [index, result] of oracle.results.entries()) {
    const resultErrors = validateOracleFormulaResult(result, index);
    errors.push(...resultErrors);
  }

  return errors;
}

function validateOracleFormulaResult(
  result: OracleFormulaResult,
  index: number,
): string[] {
  const errors: string[] = [];

  if (!result.formulaId || result.formulaId.trim() === "") {
    errors.push(`Result[${String(index)}]: Formula ID must not be empty.`);
  }

  if (!result.cellAddress || result.cellAddress.trim() === "") {
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
    (typeof result.precision !== "number" || result.precision < 0)
  ) {
    errors.push(
      `Result[${String(index)}]: Precision must be null or a non-negative number.`,
    );
  }

  return errors;
}

export function parseValToolResults(rawOutput: string): OracleFormulaResult[] {
  const results: OracleFormulaResult[] = [];
  const lines = rawOutput.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    try {
      const record = JSON.parse(trimmed) as Record<string, unknown>;
      if (
        typeof record.formulaId === "string" &&
        record.cellAddress !== undefined &&
        typeof record.cellAddress === "string"
      ) {
        results.push({
          formulaId: record.formulaId,
          cellAddress: record.cellAddress,
          computedValue: record.value ?? null,
          computedType: classifyType(record.value),
          error: typeof record.error === "string" ? record.error : null,
          precision:
            typeof record.precision === "number" ? record.precision : null,
        });
      }
    } catch {
      continue;
    }
  }

  return results;
}

export function parseRuntimeResults(rawOutput: string): OracleFormulaResult[] {
  const results: OracleFormulaResult[] = [];

  try {
    const parsed = JSON.parse(rawOutput) as Record<string, unknown>;
    if (Array.isArray(parsed.calculations)) {
      for (const calc of parsed.calculations) {
        const calculation = calc as Record<string, unknown>;
        if (
          typeof calculation.formulaId === "string" &&
          calculation.cellAddress !== undefined &&
          typeof calculation.cellAddress === "string"
        ) {
          results.push({
            formulaId: calculation.formulaId,
            cellAddress: calculation.cellAddress,
            computedValue: calculation.result ?? null,
            computedType: classifyType(calculation.result),
            error:
              typeof calculation.executionError === "string"
                ? calculation.executionError
                : null,
            precision:
              typeof calculation.decimalPlaces === "number"
                ? calculation.decimalPlaces
                : null,
          });
        }
      }
    }
  } catch {
    return [];
  }

  return results;
}

function classifyType(
  value: unknown,
): "number" | "text" | "date" | "boolean" | "error" {
  if (value === null || value === undefined) return "text";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") {
    if (value.toLowerCase() === "error" || value.startsWith("#"))
      return "error";
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
    return "text";
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
