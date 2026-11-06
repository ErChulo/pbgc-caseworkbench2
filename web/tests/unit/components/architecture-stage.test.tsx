import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArchitectureStage } from "../../../src/components/architecture/ArchitectureStage";
import { App } from "../../../src/app/App";

afterEach(cleanup);

describe("governed architecture stage UI", () => {
  it("requests a proposal without claiming to record an approval", async () => {
    const user = userEvent.setup();
    const onBuild = vi.fn().mockResolvedValue(undefined);
    render(
      <ArchitectureStage
        enabled
        message={null}
        onBuild={onBuild}
        v1Ready={false}
        onDownload={vi.fn()}
        diagnosticReady={false}
        onDownloadDiagnostic={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/does not record an architecture approval/u),
    ).toBeVisible();
    expect(
      screen.getByText(/does not execute formulas or establish correctness/),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /approve architecture/i }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Build proposed architecture" }),
    );
    expect(onBuild).toHaveBeenCalledWith();
  });

  it("allows a provisional diagnostic for a blocked workbook without enabling download", async () => {
    const onDownloadDiagnostic = vi.fn();
    render(
      <ArchitectureStage
        enabled
        message="Workbook model checks blocked output"
        onBuild={() => Promise.resolve()}
        v1Ready={false}
        onDownload={vi.fn()}
        diagnosticReady
        onDownloadDiagnostic={onDownloadDiagnostic}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Download V1 Workbook (.xlsx)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/not execution, reconciliation, or approval evidence/),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Download provisional workbook diagnostic (.json)",
      }),
    );
    expect(onDownloadDiagnostic).toHaveBeenCalledOnce();
  });

  it("renders the architecture stage inside the application shell", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Architecture selection" }),
    ).toBeVisible();
    expect(
      screen.getByText(/does not record an architecture approval/u),
    ).toBeVisible();
  });
});
