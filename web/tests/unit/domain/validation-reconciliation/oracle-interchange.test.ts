import { describe, expect, it } from "vitest";
import {
  parseRuntimeResults,
  parseValToolResults,
  validateOracleContract,
} from "../../../../src/domain/validation-reconciliation/oracle-integration";

const fixture = {
  oracleId: "synthetic-oracle",
  oracleType: "reference-calculation" as const,
  toolName: "Custom" as const,
  executedAt: "2026-01-01T00:00:00Z",
  executionVersion: "synthetic-1",
  populationSnapshot: "a".repeat(64),
  buildSpecSnapshot: "b".repeat(64),
  reliability: "provisional" as const,
  executionEvidence: null,
  results: [],
};

describe("provisional oracle interchange", () => {
  it("parses complete synthetic JSON and JSONL records without inferring execution", () => {
    const record = {
      formulaId: "f1",
      cellAddress: "A1",
      value: 0,
      precision: 2,
    };
    const valtool = parseValToolResults(
      `# synthetic only\n${JSON.stringify(record)}\n`,
    );
    const runtime = parseRuntimeResults(
      JSON.stringify({
        calculations: [
          { formulaId: "f1", cellAddress: "A1", result: 0, decimalPlaces: 2 },
        ],
      }),
    );
    expect(valtool).toEqual([
      {
        formulaId: "f1",
        cellAddress: "A1",
        computedValue: 0,
        computedType: "number",
        error: null,
        precision: 2,
      },
    ]);
    expect(runtime).toEqual(valtool);
  });
  it("fails the entire input rather than silently dropping malformed or duplicate rows", () => {
    const good = JSON.stringify({
      formulaId: "f1",
      cellAddress: "A1",
      value: 0,
    });
    for (const text of [
      `${good}\n{invalid`,
      `${good}\nnull`,
      `${good}\n${good}`,
      `${good}\n${JSON.stringify({ formulaId: "f2", cellAddress: "A2" })}`,
    ])
      expect(() => parseValToolResults(text)).toThrow();
    for (const text of [
      "{}",
      "not-json",
      JSON.stringify({
        calculations: [{ formulaId: "f1", cellAddress: "A1", result: 0 }, null],
      }),
      JSON.stringify({
        calculations: [
          { formulaId: "f1", cellAddress: "A1", result: 0 },
          { formulaId: "f1", cellAddress: "A2", result: 1 },
        ],
      }),
    ])
      expect(() => parseRuntimeResults(text)).toThrow();
  });
  it("rejects unsupported values and malformed metadata instead of replacing them with null", () => {
    for (const patch of [
      { value: {} },
      { value: null },
      { error: 42 },
      { precision: -1 },
      { precision: "2" },
    ])
      expect(() =>
        parseValToolResults(
          JSON.stringify({
            formulaId: "f1",
            cellAddress: "A1",
            value: 0,
            ...patch,
          }),
        ),
      ).toThrow();
    expect(
      parseValToolResults(
        JSON.stringify({
          formulaId: "f1",
          cellAddress: "A1",
          value: null,
          error: "Calculation failed",
        }),
      )[0]?.computedType,
    ).toBe("error");
  });
  it("checks UTC timestamps, tool labels, metadata types and malformed entries", () => {
    expect(validateOracleContract(fixture)).toEqual([]);
    for (const changes of [
      { executedAt: "2026-02-30T00:00:00Z" },
      { executedAt: "2026-01-01" },
      { toolName: "unlisted" },
      { oracleId: 1 },
      { executionEvidence: 123 },
      { results: [null] },
    ]) {
      const invalid = { ...fixture, ...changes } as unknown as Parameters<
        typeof validateOracleContract
      >[0];
      expect(validateOracleContract(invalid).length).toBeGreaterThan(0);
    }
  });
});
