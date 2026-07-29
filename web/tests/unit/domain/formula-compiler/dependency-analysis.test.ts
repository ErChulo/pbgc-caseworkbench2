import { describe, expect, it } from "vitest";
import { analyzeDependencies } from "../../../../src/domain/formula-compiler/dependency-analysis";

describe("formula dependency analysis", () => {
  it("orders dependencies before dependents", () => {
    const result = analyzeDependencies(
      [
        { formulaId: "C", dependencies: ["B"] },
        { formulaId: "B", dependencies: ["A"] },
        { formulaId: "A", dependencies: [] },
      ],
      new Set(),
    );
    expect(result.executionOrder).toEqual(["A", "B", "C"]);
  });

  it("detects cycles and blocks transitive dependents", () => {
    const result = analyzeDependencies(
      [
        { formulaId: "A", dependencies: ["B"] },
        { formulaId: "B", dependencies: ["A"] },
        { formulaId: "C", dependencies: ["A"] },
        { formulaId: "Z", dependencies: [] },
      ],
      new Set(),
    );
    expect([...result.cycleIds].sort()).toEqual(["A", "B"]);
    expect(result.dependencyBlocked.get("C")).toEqual(["A", "B"]);
    expect(result.executionOrder).toEqual(["Z"]);
  });

  it("propagates direct failures", () => {
    const result = analyzeDependencies(
      [
        { formulaId: "A", dependencies: [] },
        { formulaId: "B", dependencies: ["A"] },
        { formulaId: "Z", dependencies: [] },
      ],
      new Set(["A"]),
    );
    expect(result.dependencyBlocked.get("B")).toEqual(["A"]);
    expect(result.executionOrder).toEqual(["Z"]);
  });
});
