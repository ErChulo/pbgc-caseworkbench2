import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProvisionalOraclePanel } from "../../../src/components/formula-governance/ProvisionalOraclePanel";
import { createProvisionalOracleTemplate } from "../../../src/components/formula-governance/provisional-oracle-template";
import type { ProvisionalOracleEvidence } from "../../../src/domain/validation-reconciliation/provisional-oracle-intake";

afterEach(cleanup);

describe("provisional oracle panel", () => {
  it("makes a blank, non-execution template with exact formula targets", () => {
    expect(
      createProvisionalOracleTemplate([
        { formulaId: "synthetic-f", cellAddress: "A1" },
      ]),
    ).toBe(
      '{"formulaId":"synthetic-f","cellAddress":"A1","value":null,"error":"No result supplied"}\n',
    );
  });
  it("shows the workbook blocker and keeps local import unavailable", () => {
    render(
      <ProvisionalOraclePanel
        formulaCells={[]}
        enabled
        workbookAvailable={false}
        onImport={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByText(/Generate the current V1 workbook/)).toBeVisible();
    expect(screen.getByLabelText("Local oracle input")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save provisional evidence" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/not proof of a workbook file or execution/),
    ).toBeVisible();
  });
  it("imports a local file as a proposal and never calls it approval", async () => {
    const evidence = {
      status: "complete-proposal",
      evidenceContentSha256: "b".repeat(64),
      sourceBytesSha256: "a".repeat(64),
      missingFormulaIds: [],
      failedFormulaIds: [],
    } as unknown as ProvisionalOracleEvidence;
    const onImport = vi.fn().mockResolvedValue(evidence);
    render(
      <ProvisionalOraclePanel
        formulaCells={[]}
        enabled
        workbookAvailable
        onImport={onImport}
        onRestore={vi.fn()}
      />,
    );
    const file = new File(["synthetic"], "results.jsonl", {
      type: "application/json",
    });
    fireEvent.change(screen.getByLabelText("Local oracle input"), {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save provisional evidence" }),
    );
    await waitFor(() => {
      expect(onImport).toHaveBeenCalledWith(file, "workbench-jsonl-v1");
    });
    expect(
      await screen.findByText(/all formulas have a proposed result/),
    ).toBeVisible();
    expect(screen.getByText(/Formula approval stays blocked/)).toBeVisible();
  });
  it("reopens only the selected proposal and clears the result on verification failure", async () => {
    const hash = "c".repeat(64);
    const evidence = {
      status: "incomplete-proposal",
      evidenceContentSha256: hash,
      sourceBytesSha256: "d".repeat(64),
      missingFormulaIds: ["f2"],
      failedFormulaIds: ["f1"],
    } as unknown as ProvisionalOracleEvidence;
    const onRestore = vi
      .fn()
      .mockResolvedValueOnce(evidence)
      .mockRejectedValueOnce(new Error("Saved source failed verification."));
    render(
      <ProvisionalOraclePanel
        formulaCells={[]}
        enabled
        workbookAvailable
        onImport={vi.fn()}
        onRestore={onRestore}
      />,
    );
    fireEvent.change(screen.getByLabelText("Saved proposal SHA-256 hash"), {
      target: { value: hash },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Open saved proposal" }),
    );
    expect(await screen.findByText(/Local proposal restored/)).toBeVisible();
    expect(onRestore).toHaveBeenCalledWith(hash);
    expect(screen.getByText(/Formula approval stays blocked/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Open saved proposal" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Saved source failed verification.",
    );
    expect(
      screen.queryByText(/Local proposal restored/),
    ).not.toBeInTheDocument();
  });
  it("surfaces import errors and clears prior proposals", async () => {
    const onImport = vi
      .fn()
      .mockRejectedValue(new Error("Source bytes do not match."));
    render(
      <ProvisionalOraclePanel
        formulaCells={[]}
        enabled
        workbookAvailable
        onImport={onImport}
        onRestore={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Local oracle input"), {
      target: { files: [new File(["bad"], "input.json")] },
    });
    fireEvent.change(screen.getByLabelText("Interchange format"), {
      target: { value: "workbench-json-v1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save provisional evidence" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Source bytes do not match.",
    );
    expect(onImport).toHaveBeenCalledWith(
      expect.any(File),
      "workbench-json-v1",
    );
  });
});
