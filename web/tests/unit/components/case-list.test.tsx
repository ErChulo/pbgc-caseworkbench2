import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CaseList } from "../../../src/components/case-intake/CaseList";
import type { CaseRecord } from "../../../src/domain/case/case";
import { parseUuid, parseUtcTimestamp } from "../../../src/domain/shared/types";

afterEach(cleanup);

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-07-25T15:00:00.000Z";

function baseCase(
  overrides: Partial<{
    caseId: string;
    authoritativeCaseId: string | null;
    purpose: CaseRecord["purpose"];
    status: CaseRecord["status"];
  }> = {},
): CaseRecord {
  const uuidStr = overrides.caseId ?? UUID_A;
  const parsed = parseUuid(uuidStr);
  if (!parsed.ok) throw new Error("Invalid UUID fixture");
  const now = parseUtcTimestamp(NOW);
  if (!now.ok) throw new Error("Invalid timestamp fixture");
  return {
    caseId: parsed.value,
    authoritativeCaseId: overrides.authoritativeCaseId ?? "PBGC-SYN-001",
    purpose: overrides.purpose ?? "production",
    designationRationale: null,
    createdBy: {
      actorType: "human",
      actorKey: "synthetic-reviewer",
      displayName: "Synthetic Reviewer",
      authorityContext: "case-intake-and-collision-review",
    },
    createdAt: now.value,
    collisionDecisionId: null,
    status: overrides.status ?? "active",
    statusHistory: [],
  };
}

describe("CaseList", () => {
  it("renders an Open control for each existing case", () => {
    const onOpenCase = vi.fn<() => void>();
    render(
      <CaseList
        cases={[
          baseCase({ authoritativeCaseId: "PBGC-A" }),
          baseCase({ caseId: UUID_B, authoritativeCaseId: "PBGC-B" }),
        ]}
        onOpenCase={onOpenCase}
      />,
    );

    const buttons = screen.getAllByTestId("open-case-button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent("Open");
    expect(buttons[1]).toHaveTextContent("Open");
  });

  it("calls onOpenCase with the case UUID when Open is clicked", async () => {
    const user = userEvent.setup();
    const onOpenCase = vi.fn();
    render(
      <CaseList
        cases={[baseCase({ caseId: UUID_B })]}
        onOpenCase={onOpenCase}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open PBGC-SYN-001" }));
    expect(onOpenCase).toHaveBeenCalledTimes(1);
    expect(onOpenCase).toHaveBeenCalledWith(UUID_B);
  });

  it("displays purpose and status for each case row", () => {
    render(
      <CaseList
        cases={[baseCase({ purpose: "training", status: "closed" })]}
        onOpenCase={vi.fn()}
      />,
    );

    expect(screen.getByTestId("case-row-purpose")).toHaveTextContent(
      "Training",
    );
    expect(screen.getByTestId("case-row-status")).toHaveTextContent("closed");
  });

  it("renders no table rows when there are zero cases", () => {
    const { container } = render(<CaseList cases={[]} onOpenCase={vi.fn()} />);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
  });
});
