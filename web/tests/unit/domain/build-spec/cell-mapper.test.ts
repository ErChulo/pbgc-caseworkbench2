import { describe, expect, it } from "vitest";
import { generateCellMappings } from "../../../../src/domain/build-spec/cell-mapper";
import { createGovernedArchitecture } from "../../../fixtures/build-spec";

describe("cell mapper", () => {
  it("preserves every I/O/B value with deterministic exact mappings", async () => {
    const architecture = createGovernedArchitecture();
    expect(await generateCellMappings({ architecture })).toEqual(
      await generateCellMappings({ architecture }),
    );
    const mappings = await generateCellMappings({ architecture });
    expect(mappings.map((mapping) => mapping.iobClassification).sort()).toEqual(
      ["B", "I", "O"],
    );
  });

  it("retains both formula and input source for B", async () => {
    const mapping = (
      await generateCellMappings({ architecture: createGovernedArchitecture() })
    ).find((item) => item.iobClassification === "B");
    expect(mapping?.formulaId).toMatch(/^FORMULA-/u);
    expect(mapping?.dataSource).toMatchObject({
      sourceType: "population",
      sourceTab: "RETIREES",
      sourceField: "BENEFIT",
    });
  });

  it("does not map a header label cell whose field is already represented by a formula cell", async () => {
    const base = createGovernedArchitecture();
    const architecture = { ...base, cells: new Map(base.cells) };
    // E1 is a label cell for the SUBTOTAL field, which a formula cell (C1)
    // already represents in the same tab. Mapping the header as well would
    // duplicate the field identity and demand a formula from a label cell.
    architecture.cells.set("RETIREES::E1", {
      key: "RETIREES::E1",
      sourceTab: "RETIREES",
      cellAddress: "E1",
      genericField: "SUBTOTAL",
      description: "Synthetic subtotal label",
      hasFormula: false,
      formulaText: null,
      perRunClassification: new Map([
        [
          "DOR",
          {
            runId: "DOR",
            iob: "O" as const,
            justification: "Observed calculated output",
            ruleVersion: "synthetic-policy-v1",
          },
        ],
      ]),
    });
    const mappings = await generateCellMappings({ architecture });
    const subtotal = mappings.filter((mapping) => mapping.field === "SUBTOTAL");
    expect(subtotal).toHaveLength(1);
    expect(subtotal[0]?.cellAddress).toBe("C1");
    expect(subtotal[0]?.formulaId).toMatch(/^FORMULA-/u);
    expect(mappings.some((mapping) => mapping.cellAddress === "E1")).toBe(
      false,
    );
  });

  it("still maps a header label cell for a field with no formula cell", async () => {
    const base = createGovernedArchitecture();
    const architecture = { ...base, cells: new Map(base.cells) };
    // F1 labels the COMP field, which has no formula-bearing cell in the
    // fixture tab, so the label mapping must be retained.
    architecture.cells.set("RETIREES::F1", {
      key: "RETIREES::F1",
      sourceTab: "RETIREES",
      cellAddress: "F1",
      genericField: "COMP",
      description: "Synthetic compensation label",
      hasFormula: false,
      formulaText: null,
      perRunClassification: new Map([
        [
          "DOR",
          {
            runId: "DOR",
            iob: "I" as const,
            justification: "Observed population input",
            ruleVersion: "synthetic-policy-v1",
          },
        ],
      ]),
    });
    const mappings = await generateCellMappings({ architecture });
    expect(
      mappings.find(
        (mapping) => mapping.field === "COMP" && mapping.cellAddress === "F1",
      )?.formulaId,
    ).toBeNull();
  });
});
