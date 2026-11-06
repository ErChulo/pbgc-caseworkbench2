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
      />,
    );
    expect(
      screen.getByText(/does not record an architecture approval/u),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /approve architecture/i }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Build proposed architecture" }),
    );
    expect(onBuild).toHaveBeenCalledWith();
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
