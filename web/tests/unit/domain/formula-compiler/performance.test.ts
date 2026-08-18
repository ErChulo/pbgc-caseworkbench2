import { describe, expect, it } from "vitest";
import { cpuUsage } from "node:process";
import { compileBuildSpec } from "../../../../src/domain/formula-compiler/compiler";
import {
  buildSpecV2,
  fixedClock,
  fixedUuid,
} from "../../../fixtures/formula-compiler";

function cpuUsageMs(usage: NodeJS.CpuUsage): number {
  return (usage.user + usage.system) / 1_000;
}

describe("formula compiler performance", () => {
  it("compiles 1,000 synthetic formulas within one CPU-second", async () => {
    const makeFormulas = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `FORMULA-RETIREES-F${String(index)}-DOR`,
        field: `F_${String(index)}`,
        cell: `C${String(index + 1)}`,
        text: "=COMP+1",
      }));
    // Warm up the JIT and module caches first. Without this, first-run
    // compilation in a vitest worker that has handled earlier test files can
    // spend most of its measured CPU on V8 warm-up and garbage collection,
    // making the assertion flaky under the full parallel suite.
    const warmupSpec = await buildSpecV2(makeFormulas(100));
    await compileBuildSpec({
      buildSpec: warmupSpec,
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    const formulas = makeFormulas(1_000);
    const spec = await buildSpecV2(formulas);
    const started = cpuUsage();
    const result = await compileBuildSpec({
      buildSpec: spec,
      compilerVersion: "1.0.0",
      clock: fixedClock,
      uuid: fixedUuid,
    });
    if (!result.artifact) throw new Error("Expected a compiled artifact.");
    expect(result.status).toBe("complete");
    expect(result.artifact.deterministicPayload.compiledFormulas).toHaveLength(
      1_000,
    );
    const elapsed = cpuUsageMs(cpuUsage(started));
    expect(elapsed).toBeLessThanOrEqual(1_000);
  }, 10_000);
});
