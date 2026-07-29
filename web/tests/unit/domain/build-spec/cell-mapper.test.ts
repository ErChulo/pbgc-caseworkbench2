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
});
