import { describe, expect, it } from "vitest";
import { parseFormula } from "../../../../src/domain/formula-compiler/parser";
import { excelScalarV1Policy } from "../../../../src/domain/formula-compiler/policy";
import { resolveFormulaReferences } from "../../../../src/domain/formula-compiler/resolver";
import { buildSpecV2 } from "../../../fixtures/formula-compiler";

describe("formula reference resolver", () => {
  it("resolves exact input and formula tokens without substring matching", async () => {
    const spec = await buildSpecV2();
    const formula = spec.formulas[1];
    if (!formula) throw new Error("Expected a formula fixture.");
    const parsed = parseFormula(formula.formulaText, excelScalarV1Policy);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = resolveFormulaReferences(
      formula.formulaText,
      parsed.ast,
      formula,
      spec,
      excelScalarV1Policy,
    );
    expect(result.dependencies).toEqual(["FORMULA-RETIREES-SUBTOTAL-DOR"]);
    expect(result.references[0]).toMatchObject({
      originalText: "SUBTOTAL",
      referenceKind: "formula",
    });
  });

  it("resolves an unqualified A1 reference to the target sheet", async () => {
    const spec = await buildSpecV2([
      { id: "FORMULA-RETIREES-X-DOR", field: "X", cell: "C1", text: "=A1" },
    ]);
    const formula = spec.formulas[0];
    if (!formula) throw new Error("Expected a formula fixture.");
    const parsed = parseFormula(formula.formulaText, excelScalarV1Policy);
    if (!parsed.ok) throw new Error("fixture parse failed");
    const result = resolveFormulaReferences(
      formula.formulaText,
      parsed.ast,
      formula,
      spec,
      excelScalarV1Policy,
    );
    expect(result.references[0]?.normalizedText).toBe("'RETIREES'!A1");
    expect(result.references[0]?.referenceKind).toBe("input");
  });

  it("rejects an unmapped in-grid cell", async () => {
    const spec = await buildSpecV2([
      {
        id: "FORMULA-RETIREES-X-DOR",
        field: "X",
        cell: "C1",
        text: "=Z999",
      },
    ]);
    const formula = spec.formulas[0];
    if (!formula) throw new Error("Expected a formula fixture.");
    const parsed = parseFormula(formula.formulaText, excelScalarV1Policy);
    if (!parsed.ok) throw new Error("fixture parse failed");
    const result = resolveFormulaReferences(
      formula.formulaText,
      parsed.ast,
      formula,
      spec,
      excelScalarV1Policy,
    );
    expect(result.issues[0]?.code).toBe("REFERENCE_UNRESOLVED");
  });

  it("does not resolve an unqualified field from another sheet", async () => {
    const base = await buildSpecV2([
      {
        id: "FORMULA-RETIREES-X-DOR",
        field: "X",
        cell: "C1",
        text: "=OTHER_FIELD",
      },
    ]);
    const otherSheetMapping = base.cellMappings[0];
    if (!otherSheetMapping)
      throw new Error("Expected an input mapping fixture.");
    const spec = {
      ...base,
      cellMappings: [
        {
          ...otherSheetMapping,
          field: "OTHER_FIELD",
          tabName: "OTHER",
        },
        ...base.cellMappings.slice(1),
      ],
    };
    const formula = spec.formulas[0];
    if (!formula) throw new Error("Expected a formula fixture.");
    const parsed = parseFormula(formula.formulaText, excelScalarV1Policy);
    if (!parsed.ok) throw new Error("fixture parse failed");
    const result = resolveFormulaReferences(
      formula.formulaText,
      parsed.ast,
      formula,
      spec,
      excelScalarV1Policy,
    );
    expect(result.issues[0]?.code).toBe("REFERENCE_UNRESOLVED");
  });
});
