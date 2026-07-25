import { describe, expect, it } from "vitest";

import { deterministicSha256 } from "../../src/domain/normalization/normalizer";
import { reconcileInventory } from "../../src/domain/manifests/reconciliation";

describe("T115 golden corpus normalization", () => {
  it("reprocesses a synthetic corpus twice with byte-identical deterministic results", async () => {
    const corpus = {
      deterministicPayload: {
        artifacts: [
          {
            path: "synthetic.txt",
            sha256: "a".repeat(64),
            status: "provisional",
          },
          {
            path: "synthetic.csv",
            sha256: "b".repeat(64),
            status: "provisional",
          },
        ],
        unresolvedItems: [{ itemKey: "missing-field", status: "open" }],
      },
    };
    expect(await deterministicSha256(structuredClone(corpus))).toBe(
      await deterministicSha256(structuredClone(corpus)),
    );
    const reconciliation = reconcileInventory(
      ["one", "two"],
      [
        { recordId: "one", category: "source-artifact" },
        { recordId: "two", category: "source-artifact" },
      ],
      [
        { recordId: "one", category: "pending-human-disposition" },
        { recordId: "two", category: "pending-human-disposition" },
      ],
    );
    expect(reconciliation.governedStatus).toBe("provisional");
  });
});
