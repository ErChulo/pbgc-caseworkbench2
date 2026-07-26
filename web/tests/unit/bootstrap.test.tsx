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

    // The feasibility probe resolves asynchronously. The resulting status
    // text lives inside a `<strong>` child under jsdom, so a `findByText`
    // regex across the `<p>` parent is reported as "broken up by multiple
    // elements" by testing-library. Instead, wait on the toggle button —
    // it is only mounted after the probe resolves — and then verify the
    // `data-feasibility` attribute reflects the pass/fail decision so an
    // operator can drill into the underlying checks on demand.
    await expect(
      screen.findByRole("button", { name: /Show technical details/u }),
    ).resolves.toBeVisible();
    const feasibilityNode = document.querySelector("[data-feasibility]");
    expect(feasibilityNode).not.toBeNull();
    expect(feasibilityNode?.getAttribute("data-feasibility")).toMatch(
      /^(pass|fail)$/,
    );
  });
});
