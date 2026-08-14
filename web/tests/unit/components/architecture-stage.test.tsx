import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArchitectureStage } from "../../../src/components/architecture/ArchitectureStage";
import { App } from "../../../src/app/App";

afterEach(cleanup);

describe("governed architecture stage UI", () => {
  it("requires explicit human selection and approval inputs", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue(undefined);

    render(
      <ArchitectureStage
        enabled
        scenarioOptions={["DOR", "NRD"]}
        tabOptions={["RETIREES", "TERMS"]}
        message={null}
        selection={null}
        onApprove={onApprove}
        v1Ready={false}
        onDownload={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Architecture selection" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Approve architecture selection" }),
    ).toBeDisabled();

    await user.click(screen.getByLabelText("DOR"));
    await user.click(screen.getByLabelText("RETIREES"));
    await user.type(screen.getByLabelText("Reviewer"), "Synthetic Reviewer");
    await user.type(
      screen.getByLabelText("Architecture approval rationale"),
      "Governed scenario and tab approval.",
    );

    await user.click(
      screen.getByRole("button", { name: "Approve architecture selection" }),
    );

    expect(onApprove).toHaveBeenCalledWith({
      scenarioIds: ["DOR"],
      tabNames: ["RETIREES"],
      reviewer: "Synthetic Reviewer",
      rationale: "Governed scenario and tab approval.",
    });
  });

  it("renders the architecture stage inside the application shell", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Architecture selection" }),
    ).toBeVisible();
    expect(
      screen.getByText(/Reference matches remain proposals only./u),
    ).toBeVisible();
  });
});
