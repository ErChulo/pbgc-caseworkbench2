import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BootstrapApp } from "../../src/app/BootstrapApp";

describe("Phase 1 bootstrap", () => {
  it("labels the shell as setup-only and local", async () => {
    render(<BootstrapApp />);

    expect(
      screen.getByRole("heading", { name: "Evidence intake foundation" }),
    ).toBeVisible();
    expect(
      screen.getByLabelText("Current implementation maturity: setup only"),
    ).toBeVisible();
    expect(screen.getByText(/No participant data is loaded/u)).toBeVisible();
    await expect(
      screen.findByRole("heading", { name: "Browser feasibility probe" }),
    ).resolves.toBeVisible();
  });
});
