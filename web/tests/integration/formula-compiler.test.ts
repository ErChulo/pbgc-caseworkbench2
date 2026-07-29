import { describe, expect, it } from "vitest";
import { compileBuildSpec } from "../../src/domain/formula-compiler/compiler";
import {
  buildSpecV2,
  fixedClock,
  fixedUuid,
} from "../fixtures/formula-compiler";

describe("formula compiler integration", () => {
  it("emits independent formulas and blocks a failed dependency chain", async () => {
    const spec = await buildSpecV2([
      {
        id: "FORMULA-RETIREES-A-DOR",
        field: "A",
        cell: "C1",
        text: "=TODAY()",
      },
      {
        id: "FORMULA-RETIREES-B-DOR",
        field: "B",
        cell: "D1",
        text: "=A+1",
        dependencies: ["FORMULA-RETIREES-A-DOR"],
      },
      { id: "FORMULA-RETIREES-Z-DOR", field: "Z", cell: "E1", text: "=COMP+1" },
    ]);
    const result = await compileBuildSpec({
      buildSpec: spec,
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    if (!result.artifact) throw new Error("Expected a partial artifact.");
    expect(result.status).toBe("partial");
    expect(
      result.artifact.deterministicPayload.compiledFormulas.map(
        (formula) => formula.formulaId,
      ),
    ).toEqual(["FORMULA-RETIREES-Z-DOR"]);
    expect(result.artifact.deterministicPayload.blockedFormulas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          formulaId: "FORMULA-RETIREES-A-DOR",
          status: "failed",
        }),
        expect.objectContaining({
          formulaId: "FORMULA-RETIREES-B-DOR",
          status: "dependency-blocked",
        }),
      ]),
    );
  });
});
