import { describe, expect, it } from "vitest";
import { emitCanonicalFormula } from "../../../../src/domain/formula-compiler/emitter";
import { parseFormula } from "../../../../src/domain/formula-compiler/parser";
import { excelScalarV1Policy } from "../../../../src/domain/formula-compiler/policy";

describe("formula parser", () => {
  it.each([
    ["=1+2*3", "(1+(2*3))"],
    ["(1+2)*3", "((1+2)*3)"],
    ["true", "TRUE"],
    ['"A"&"B"', '("A"&"B")'],
    ["IF(A1>0,ROUND(A1,2),0)", "IF((A1>0),ROUND(A1,2),0)"],
  ])("parses and canonically emits %s", (source, expected) => {
    const parsed = parseFormula(source, excelScalarV1Policy);
    expect(parsed.ok).toBe(true);
    if (parsed.ok)
      expect(emitCanonicalFormula(parsed.ast, new Map())).toBe(expected);
  });

  it("tracks quoted sheet names and escaped apostrophes", () => {
    const parsed = parseFormula("'O''Brien Data'!A1", excelScalarV1Policy);
    expect(
      parsed.ok && parsed.ast.kind === "reference"
        ? parsed.ast.sheetName
        : null,
    ).toBe("O'Brien Data");
  });

  it.each([
    ["", "EMPTY_FORMULA"],
    ["==A1", "MULTIPLE_LEADING_EQUALS"],
    ["1E3", "INVALID_NUMBER"],
    ["{1,2}", "ARRAY_SYNTAX_PROHIBITED"],
    ["A1#", "DYNAMIC_ARRAY_PROHIBITED"],
  ])("rejects %s with %s", (source, code) => {
    const parsed = parseFormula(source, excelScalarV1Policy);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues[0]?.code).toBe(code);
  });
});
