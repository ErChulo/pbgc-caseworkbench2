import { describe, expect, it } from "vitest";

import { reconcileInventory } from "../../src/domain/manifests/reconciliation";

describe("T057 two-ledger reconciliation", () => {
  it("balances independent origin and terminal ledgers while governed state stays provisional", () => {
    const result = reconcileInventory(
      ["a", "b"],
      [
        { recordId: "a", category: "source-artifact" },
        { recordId: "b", category: "extracted-member" },
      ],
      [
        { recordId: "a", category: "accepted-for-processing" },
        { recordId: "b", category: "provisional-safety-block" },
      ],
    );
    expect(result).toMatchObject({
      discoveredRecordTotal: 2,
      governedStatus: "provisional",
    });
    expect(result.terminalDispositionLedger[1]?.category).toBe(
      "provisional-safety-block",
    );
    expect(result).not.toHaveProperty("released");
  });

  it.each([
    [[], [{ recordId: "a", category: "accepted-for-processing" as const }]],
    [
      [
        { recordId: "a", category: "source-artifact" as const },
        { recordId: "a", category: "extracted-member" as const },
      ],
      [{ recordId: "a", category: "accepted-for-processing" as const }],
    ],
    [[{ recordId: "a", category: "source-artifact" as const }], []],
  ])(
    "rejects missing, duplicate, or independently unbalanced ledgers",
    (origins, terminals) => {
      expect(() => reconcileInventory(["a"], origins, terminals)).toThrow(
        /ledger/u,
      );
    },
  );
});
