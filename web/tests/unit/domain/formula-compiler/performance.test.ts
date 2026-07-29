import { describe, expect, it } from "vitest";
import { compileBuildSpec } from "../../../../src/domain/formula-compiler/compiler";
import {
  buildSpecV2,
  fixedClock,
  fixedUuid,
} from "../../../fixtures/formula-compiler";

describe("formula compiler performance", () => {
  it("compiles 1,000 synthetic formulas within one second", async () => {
    const formulas = Array.from({ length: 1_000 }, (_, index) => ({
      id: `FORMULA-RETIREES-F${String(index)}-DOR`,
      field: `F_${String(index)}`,
      cell: `C${String(index + 1)}`,
      text: "=COMP+1",
    }));
    const spec = await buildSpecV2(formulas);
    const started = performance.now();
    const result = await compileBuildSpec({
      buildSpec: spec,
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    if (!result.artifact) throw new Error("Expected a compiled artifact.");
    const elapsed = performance.now() - started;
    expect(result.status).toBe("complete");
    expect(result.artifact.deterministicPayload.compiledFormulas).toHaveLength(
      1_000,
    );
    expect(elapsed).toBeLessThanOrEqual(1_000);
  }, 10_000);
});
