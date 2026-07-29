import { describe, expect, it } from "vitest";
import { generateNamedRanges } from "../../../../src/domain/build-spec/range-builder";
import { createGovernedArchitecture } from "../../../fixtures/build-spec";

describe("named range builder", () => {
  it("preserves exact architecture names, targets, scope, and identity", () => {
    const ranges = generateNamedRanges({
      architecture: createGovernedArchitecture(),
    });
    expect(ranges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rangeName: "COMP",
          tabName: "RETIREES",
          cellAddress: "A1",
          scope: "workbook",
          scenarioId: null,
        }),
        expect.objectContaining({
          rangeName: "SUBTOTAL",
          tabName: "RETIREES",
          cellAddress: "C1",
          scope: "sheet",
          genericField: null,
          scenarioId: null,
        }),
      ]),
    );
  });

  it("does not invent ranges for unnamed cells", () => {
    expect(
      generateNamedRanges({ architecture: createGovernedArchitecture() }),
    ).toHaveLength(2);
  });
});
