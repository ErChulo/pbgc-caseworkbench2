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
    ).toBe('{"formulaId":"synthetic-f","cellAddress":"A1","value":null}\n');
  });
  it("shows the workbook blocker and keeps local import unavailable", () => {
    render(
      <ProvisionalOraclePanel
        formulaCells={[]}
        enabled
        workbookAvailable={false}
        onImport={vi.fn()}
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
