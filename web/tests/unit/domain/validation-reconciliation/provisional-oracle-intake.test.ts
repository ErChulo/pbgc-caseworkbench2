import { createProvisionalOracleTemplate } from "../../../../src/components/formula-governance/provisional-oracle-template";
import { describe, expect, it } from "vitest";
import {
  createProvisionalOracleEvidence,
  verifyProvisionalOracleEvidence,
} from "../../../../src/domain/validation-reconciliation/provisional-oracle-intake";
import { computeWorkbookContentHash } from "../../../../src/domain/workbook-builder/workbook-hash";
import type { V1Workbook } from "../../../../src/domain/workbook-builder/models";
import { parseUuid } from "../../../../src/domain/shared/types";

const parsed = parseUuid("00000000-0000-4000-8000-000000000001");
if (!parsed.ok) throw new Error("Synthetic case invalid");
const caseId = parsed.value;
async function fixture() {
  const draft = {
    caseId,
    workbookContentSha256: "0".repeat(64),
    buildSpecContentSha256: "a".repeat(64),
    populationProfileContentSha256: "b".repeat(64),
    formulaCells: [
      { formulaId: "f1", cellAddress: "A1" },
      { formulaId: "f2", cellAddress: "B1" },
    ],
  } as unknown as V1Workbook;
  const workbook = {
    ...draft,
    workbookContentSha256: await computeWorkbookContentHash(draft),
  };
  const sourceBytes = new TextEncoder().encode(
    [
      JSON.stringify({ formulaId: "f2", cellAddress: "B1", value: 2 }),
      JSON.stringify({ formulaId: "f1", cellAddress: "A1", value: 0 }),
    ].join("\n"),
  );
  return {
    caseId,
    workbook,
    sourceBytes,
    format: "workbench-jsonl-v1" as const,
  };
}

describe("case-scoped provisional oracle intake", () => {
  it("binds exact synthetic bytes to a case and workbook as a proposal, not execution or approval", async () => {
    const input = await fixture();
    const first = await createProvisionalOracleEvidence(input);
    const second = await createProvisionalOracleEvidence(input);
    expect(first).toEqual(second);
    if (!first.ok) throw new Error(first.message);
    expect(first.evidence.status).toBe("complete-proposal");
    expect(first.evidence.results.map((result) => result.formulaId)).toEqual([
      "f1",
      "f2",
    ]);
    expect(Object.isFrozen(first.evidence.results[0])).toBe(true);
    expect(
      await verifyProvisionalOracleEvidence({
        ...input,
        evidence: first.evidence,
      }),
    ).toBe(true);
    expect("reliability" in first.evidence).toBe(false);
    expect("reviewer" in first.evidence).toBe(false);
  });
  it("shows missing or failed formula results without creating a complete proposal", async () => {
    const input = await fixture();
    const sourceBytes = new TextEncoder().encode(
      JSON.stringify({
        formulaId: "f1",
        cellAddress: "A1",
        value: null,
        error: "synthetic failure",
      }),
    );
    const result = await createProvisionalOracleEvidence({
      ...input,
      sourceBytes,
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.evidence.status).toBe("incomplete-proposal");
    expect(result.evidence.missingFormulaIds).toEqual(["f2"]);
    expect(result.evidence.failedFormulaIds).toEqual(["f1"]);
  });
  it("imports a blank template only as incomplete and accepts completed replacement values", async () => {
    const input = await fixture();
    const template = createProvisionalOracleTemplate(
      input.workbook.formulaCells,
    );
    const blank = await createProvisionalOracleEvidence({
      ...input,
      sourceBytes: new TextEncoder().encode(template),
    });
    if (!blank.ok) throw new Error(blank.message);
    expect(blank.evidence.status).toBe("incomplete-proposal");
    expect(blank.evidence.failedFormulaIds).toEqual(["f1", "f2"]);
    const completed = template
      .trim()
      .split("\n")
      .map((line) => {
        const { formulaId, cellAddress } = JSON.parse(line) as {
          formulaId: string;
          cellAddress: string;
        };
        return JSON.stringify({ formulaId, cellAddress, value: 0 });
      })
      .join("\n");
    const proposal = await createProvisionalOracleEvidence({
      ...input,
      sourceBytes: new TextEncoder().encode(completed),
    });
    if (!proposal.ok) throw new Error(proposal.message);
    expect(proposal.evidence.status).toBe("complete-proposal");
  });
  it("accepts the documented JSON calculations format without claiming execution", async () => {
    const input = await fixture();
    const sourceBytes = new TextEncoder().encode(
      JSON.stringify({
        calculations: [
          { formulaId: "f1", cellAddress: "A1", result: 0 },
          {
            formulaId: "f2",
            cellAddress: "B1",
            result: null,
            executionError: "No result supplied",
          },
        ],
      }),
    );
    const proposal = await createProvisionalOracleEvidence({
      ...input,
      format: "workbench-json-v1",
      sourceBytes,
    });
    if (!proposal.ok) throw new Error(proposal.message);
    expect(proposal.evidence.status).toBe("incomplete-proposal");
    expect(proposal.evidence.failedFormulaIds).toEqual(["f2"]);
    expect("executedAt" in proposal.evidence).toBe(false);
  });
  it("rejects unknown, duplicate, wrong-cell or malformed results", async () => {
    const input = await fixture();
    for (const text of [
      JSON.stringify({ formulaId: "unknown", cellAddress: "A1", value: 0 }),
      JSON.stringify({ formulaId: "f1", cellAddress: "B1", value: 0 }),
      `${JSON.stringify({ formulaId: "f1", cellAddress: "A1", value: 0 })}\ninvalid`,
      `${JSON.stringify({ formulaId: "f1", cellAddress: "A1", value: 0 })}\n${JSON.stringify({ formulaId: "f1", cellAddress: "A1", value: 0 })}`,
    ])
      expect(
        (
          await createProvisionalOracleEvidence({
            ...input,
            sourceBytes: new TextEncoder().encode(text),
          })
        ).ok,
      ).toBe(false);
  });
  it("rejects altered source, workbook, case and evidence content", async () => {
    const input = await fixture();
    const result = await createProvisionalOracleEvidence(input);
    if (!result.ok) throw new Error(result.message);
    const changed = input.sourceBytes.slice();
    changed[0] = (changed[0] ?? 0) ^ 1;
    expect(
      await verifyProvisionalOracleEvidence({
        ...input,
        evidence: result.evidence,
        sourceBytes: changed,
      }),
    ).toBe(false);
    expect(
      await verifyProvisionalOracleEvidence({
        ...input,
        evidence: { ...result.evidence, status: "incomplete-proposal" },
      }),
    ).toBe(false);
    expect(
      (
        await createProvisionalOracleEvidence({
          ...input,
          workbook: { ...input.workbook, caseId: "other" as typeof caseId },
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await createProvisionalOracleEvidence({
          ...input,
          workbook: { ...input.workbook, formulaCells: [] },
        })
      ).ok,
    ).toBe(false);
  });
  it("copies caller bytes and workbook before asynchronous verification", async () => {
    const input = await fixture();
    const expected = await createProvisionalOracleEvidence(input);
    const pending = createProvisionalOracleEvidence(input);
    input.sourceBytes[0] = 0;
    (input.workbook as { caseId: string }).caseId = "other";
    expect(await pending).toEqual(expected);
  });
});
