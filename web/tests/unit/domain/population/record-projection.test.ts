import { describe, expect, it } from "vitest";
import { projectPopulationRecord } from "../../../../src/domain/population/record-projection";
import {
  workbookProfileContentHash,
  type PopulationWorkbookCell,
} from "../../../../src/domain/population/workbook-adapter";
import { classifyRawValue } from "../../../../src/domain/population/tabular-adapter";

const cell = (
  address: string,
  storedValue: unknown,
  formulaText: string | null = null,
  cellType = "s",
): PopulationWorkbookCell => ({
  sheet: "Synthetic",
  address,
  storedValue,
  formulaText,
  cellType,
  kind: formulaText === null ? classifyRawValue(storedValue) : "formula-text",
});
async function fixture() {
  const workbook = {
    status: "profiled" as const,
    sheets: [
      {
        name: "Synthetic",
        hidden: false,
        cells: [
          cell("A10", "second"),
          cell("B2", 0, null, "n"),
          cell("A1", "Key"),
          cell("B1", "Amount"),
          cell("C1", "Code"),
          cell("D1", "Other"),
          cell("A2", "first"),
          cell("C2", ""),
          cell("B10", 123, null, "n"),
          cell("C10", "0012"),
          cell("D10", 9, "1+1", "n"),
        ],
      },
    ],
    formulaExecutionCount: 0 as const,
    limitations: [],
  };
  const hash = await workbookProfileContentHash(workbook, []);
  return {
    workbook,
    namedRanges: [],
    populationDecision: {
      status: "approved" as const,
      effectiveDecisionId: "review-1",
      effectiveWorkbookProfileContentSha256: hash,
      provenance: ["review-1"],
    },
    sheetName: "Synthetic",
    sourceRow: 2,
    bindings: [
      { field: "KEY", column: "A", expectedHeader: "Key" },
      { field: "AMOUNT", column: "B", expectedHeader: "Amount" },
      { field: "CODE", column: "C", expectedHeader: "Code" },
      { field: "OTHER", column: "D", expectedHeader: "Other" },
    ],
  };
}

describe("explicit population record projection", () => {
  it("retains the exact selected row, sparse missing values, blanks and zero", async () => {
    const input = await fixture();
    const result = await projectPopulationRecord(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.sourceRow).toBe(2);
    expect(result.record.hasOnlyValues).toBe(false);
    expect(result.record.fields).toEqual([
      {
        field: "AMOUNT",
        sourceAddress: "B2",
        state: "value",
        value: 0,
        formulaText: null,
      },
      {
        field: "CODE",
        sourceAddress: "C2",
        state: "blank",
        value: "",
        formulaText: null,
      },
      {
        field: "KEY",
        sourceAddress: "A2",
        state: "value",
        value: "first",
        formulaText: null,
      },
      {
        field: "OTHER",
        sourceAddress: "D2",
        state: "missing",
        value: null,
        formulaText: null,
      },
    ]);
    expect(
      await projectPopulationRecord({
        ...input,
        bindings: [...input.bindings].reverse(),
      }),
    ).toEqual(result);
    const complete = await projectPopulationRecord({
      ...input,
      bindings: input.bindings.slice(0, 2),
    });
    expect(complete.ok && complete.record.hasOnlyValues).toBe(true);
    const second = await projectPopulationRecord({ ...input, sourceRow: 10 });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.record.recordContentSha256).not.toBe(
      result.record.recordContentSha256,
    );
    expect(second.record.fields.find((f) => f.field === "CODE")?.value).toBe(
      "0012",
    );
    expect(second.record.fields.find((f) => f.field === "OTHER")).toMatchObject(
      { state: "formula", value: null, formulaText: "1+1" },
    );
  });

  it("requires the selected profile hash and approved population decision", async () => {
    const input = await fixture();
    const notApproved = await projectPopulationRecord({
      ...input,
      populationDecision: {
        ...input.populationDecision,
        status: "provisional",
      },
    });
    expect(notApproved).toMatchObject({
      ok: false,
      code: "POPULATION_NOT_APPROVED",
    });
    const changed = { ...input.workbook, limitations: ["changed"] };
    expect(
      await projectPopulationRecord({ ...input, workbook: changed }),
    ).toMatchObject({ ok: false, code: "PROFILE_HASH_MISMATCH" });
  });

  it("rejects guessed headers, duplicate bindings, invalid rows and absent sheets", async () => {
    const input = await fixture();
    expect(
      await projectPopulationRecord({ ...input, sourceRow: 1 }),
    ).toMatchObject({ ok: false, code: "SELECTION_INVALID" });
    expect(
      await projectPopulationRecord({ ...input, sheetName: "Other" }),
    ).toMatchObject({ ok: false, code: "SOURCE_SHEET_INVALID" });
    expect(
      await projectPopulationRecord({
        ...input,
        bindings: [{ field: "KEY", column: "A", expectedHeader: "Wrong" }],
      }),
    ).toMatchObject({ ok: false, code: "HEADER_MISMATCH" });
    expect(
      await projectPopulationRecord({
        ...input,
        bindings: [
          { field: "KEY", column: "A", expectedHeader: "Key" },
          { field: "KEY", column: "A", expectedHeader: "Key" },
        ],
      }),
    ).toMatchObject({ ok: false, code: "FIELD_BINDING_INVALID" });
    expect(
      await projectPopulationRecord({
        ...input,
        bindings: [{ field: "KEY", column: "XFE", expectedHeader: "Key" }],
      }),
    ).toMatchObject({ ok: false, code: "FIELD_BINDING_INVALID" });
  });

  it("rejects duplicate observations after a valid profile hash", async () => {
    const input = await fixture();
    const sheet = input.workbook.sheets[0];
    if (!sheet) throw new Error("Missing fixture sheet");
    const workbook = {
      ...input.workbook,
      sheets: [
        { ...sheet, cells: [...sheet.cells, cell("$A$2", "duplicate")] },
      ],
    };
    const hash = await workbookProfileContentHash(workbook, []);
    expect(
      await projectPopulationRecord({
        ...input,
        workbook,
        populationDecision: {
          ...input.populationDecision,
          effectiveWorkbookProfileContentSha256: hash,
        },
      }),
    ).toMatchObject({ ok: false, code: "SOURCE_CELLS_INVALID" });
  });
});

describe("population record snapshot safety", () => {
  it("binds the digest, selected row, bindings and decision to the same input snapshot", async () => {
    const input = await fixture();
    const expected = await projectPopulationRecord(input);
    if (!expected.ok) throw new Error("Invalid fixture");
    const pending = projectPopulationRecord(input);
    const sheet = input.workbook.sheets[0];
    if (!sheet) throw new Error("Missing fixture sheet");
    const cellToChange = sheet.cells.find(
      (candidate) => candidate.address === "A2",
    );
    if (!cellToChange) throw new Error("Missing fixture cell");
    (cellToChange as { storedValue: unknown }).storedValue =
      "changed during hash";
    const binding = input.bindings[0];
    if (!binding) throw new Error("Missing fixture binding");
    binding.field = "DIFFERENT";
    input.populationDecision.effectiveDecisionId = "different-decision";
    input.sourceRow = 10;
    const result = await pending;
    expect(result).toEqual(expected);
    if (!result.ok) throw new Error("Projection failed");
    expect(Object.isFrozen(result.record)).toBe(true);
    expect(Object.isFrozen(result.record.fields)).toBe(true);
    expect(result.record.fields.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(input.workbook)).toBe(false);
    expect(Object.isFrozen(input.bindings)).toBe(false);
  });

  it("fails closed if the input cannot be safely snapshotted", async () => {
    const input = await fixture();
    const sheet = input.workbook.sheets[0];
    if (!sheet) throw new Error("Missing fixture sheet");
    const unsafe = {
      ...input,
      workbook: {
        ...input.workbook,
        sheets: [
          { ...sheet, cells: [...sheet.cells, cell("E2", () => undefined)] },
        ],
      },
    };
    expect(await projectPopulationRecord(unsafe)).toMatchObject({
      ok: false,
      code: "INPUT_SNAPSHOT_FAILED",
    });
  });
});
