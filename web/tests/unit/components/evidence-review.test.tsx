import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceCatalogReview } from "../../../src/components/evidence/EvidenceCatalogReview";
import { PlanRuleAuthor } from "../../../src/components/evidence/PlanRuleAuthor";
import { ProvisionCandidateReview } from "../../../src/components/evidence/ProvisionCandidateReview";
import { UnresolvedItemQueue } from "../../../src/components/evidence/UnresolvedItemQueue";
import { evidenceReviewDemo } from "../../../src/components/evidence/demo-evidence";
import { App } from "../../../src/app/App";

afterEach(cleanup);

describe("Feature 001 evidence reviewer UI", () => {
  it("wires every evidence review stage into the application navigator", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Evidence catalog review" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Candidates" }));
    expect(screen.getByText("Showing Candidates.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Provision candidate review" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Rule authoring" }));
    expect(
      screen.getByRole("heading", { name: "Plan rule author" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Unresolved items" }));
    expect(
      screen.getByRole("heading", { name: "Unresolved item queue" }),
    ).toBeVisible();
  });

  it("filters catalog artifacts and keeps quarantine exclusions visible", async () => {
    const user = userEvent.setup();
    render(<EvidenceCatalogReview catalog={evidenceReviewDemo.catalog} />);

    expect(
      screen.getByText("3 catalog artifact(s) match this filter"),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Quarantined exclusions" }),
    ).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText("Filter by source role"),
      "amendment",
    );
    expect(
      screen.getByText("1 catalog artifact(s) match this filter"),
    ).toBeVisible();
    expect(screen.getByText("synthetic/amendment-01.txt#line-7")).toBeVisible();
    expect(
      screen.queryByText("synthetic/plan-document.txt#line-18"),
    ).not.toBeInTheDocument();
  });

  it("shows candidate provenance, status, and documentary relationships", () => {
    render(
      <ProvisionCandidateReview
        candidates={evidenceReviewDemo.candidates.map((item) => item.candidate)}
        nearDuplicates={evidenceReviewDemo.nearDuplicates}
        supersessions={evidenceReviewDemo.supersessions}
      />,
    );

    expect(
      screen.getAllByText(/Status: Proposed|Status: Unresolved/u),
    ).toHaveLength(2);
    expect(screen.getAllByText(/Near-duplicate relationship/u)).toHaveLength(2);
    expect(screen.getAllByText(/Proposed amendment link/u)).toHaveLength(2);
    expect(screen.getAllByText("Verbatim source text")).toHaveLength(2);
    expect(screen.getAllByText("Normalized restatement")).toHaveLength(2);
  });

  it("blocks authoring on open items and enables an explicit reviewed approval", async () => {
    const user = userEvent.setup();
    const onAuthor = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <PlanRuleAuthor
        candidates={evidenceReviewDemo.candidates}
        unresolvedItems={evidenceReviewDemo.unresolvedItems}
        existingRules={[]}
        onAuthor={onAuthor}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "BLOCKED_BY_UNRESOLVED_ITEM",
    );
    expect(
      screen.getByRole("button", { name: "Validate rule preview" }),
    ).toBeDisabled();
    const amendmentCandidate = screen.getByLabelText(
      "Provision 4.1, effective 2020-07-31",
    );
    await user.click(amendmentCandidate);
    await user.selectOptions(
      screen.getByLabelText("Primary citation"),
      evidenceReviewDemo.candidates[1]?.candidate.candidateId ?? "",
    );
    await user.click(amendmentCandidate);
    expect(screen.getByLabelText("Primary citation")).toHaveValue("");
    expect(
      within(screen.getByLabelText("Primary citation")).queryByText(
        /synthetic\/amendment-01\.txt/u,
      ),
    ).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Primary citation"),
      evidenceReviewDemo.candidates[0]?.candidate.candidateId ?? "",
    );
    view.rerender(
      <PlanRuleAuthor
        candidates={evidenceReviewDemo.candidates}
        unresolvedItems={evidenceReviewDemo.unresolvedItems.map((item) => ({
          ...item,
          status: "resolved",
        }))}
        existingRules={[]}
        onAuthor={onAuthor}
      />,
    );
    await user.type(
      screen.getByLabelText("Condition value"),
      "all synthetic participants",
    );
    await user.type(
      screen.getByLabelText("Authorized reviewer"),
      "Synthetic Reviewer",
    );
    await user.type(
      screen.getByLabelText("Approval rationale"),
      "Reviewed synthetic evidence.",
    );
    expect(screen.getByLabelText("Effective date")).toBeRequired();
    const restatement = screen.getByLabelText("Governing restatement");
    await user.clear(restatement);
    expect(
      screen.getByRole("button", { name: "Validate rule preview" }),
    ).toBeDisabled();
    await user.type(restatement, "Synthetic governing restatement.");
    await user.click(
      screen.getByRole("button", { name: "Validate rule preview" }),
    );
    expect(onAuthor).toHaveBeenCalledWith(
      expect.objectContaining({
        applicabilityValue: "all synthetic participants",
      }),
    );
  });

  it("offers typed unresolved actions with an interpretation and human rationale", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockResolvedValue({
      ok: true,
      message:
        "branch passed governed validation in this synthetic session preview. The decision was not persisted.",
    });
    render(
      <UnresolvedItemQueue
        items={evidenceReviewDemo.unresolvedItems}
        onAction={onAction}
      />,
    );

    await user.type(
      screen.getByLabelText("Reviewer name"),
      "Synthetic Reviewer",
    );
    await user.type(
      screen.getByLabelText("Resolution rationale"),
      "Preserve alternate scope.",
    );
    const item = screen
      .getByRole("heading", { name: "Ambiguous text" })
      .closest("li");
    expect(item).not.toBeNull();
    if (item === null) return;
    expect(within(item).getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(
      within(item).getByRole("button", { name: "Supersede" }),
    ).toBeEnabled();
    expect(within(item).getByRole("button", { name: "Reject" })).toBeEnabled();
    await user.click(within(item).getByRole("button", { name: "Branch" }));
    expect(
      await screen.findByText(/branch passed governed validation/u),
    ).toBeInTheDocument();
    expect(onAction).toHaveBeenCalledWith(
      evidenceReviewDemo.unresolvedItems[0],
      "branch",
      evidenceReviewDemo.unresolvedItems[0]?.competingInterpretations[0]
        ?.interpretationId,
      "Synthetic Reviewer",
      "Preserve alternate scope.",
    );
  });

  it("keeps governed decisions and rules in a resettable session preview", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByText(/does not persist decisions or rules/u),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Unresolved items" }));
    await user.type(
      screen.getByLabelText("Reviewer name"),
      "Synthetic Reviewer",
    );
    await user.type(
      screen.getByLabelText("Resolution rationale"),
      "Synthetic interpretation reviewed.",
    );
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Status: Resolved")).toBeVisible();
    expect(
      await screen.findByText(/decision was not persisted/u),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rule authoring" }));
    await user.type(
      screen.getByLabelText("Condition value"),
      "all synthetic participants",
    );
    await user.type(
      screen.getByLabelText("Authorized reviewer"),
      "Synthetic Reviewer",
    );
    await user.type(
      screen.getByLabelText("Approval rationale"),
      "Synthetic evidence reviewed.",
    );
    await user.click(
      screen.getByRole("button", { name: "Validate rule preview" }),
    );
    expect(
      await screen.findByText(/Governed validation passed/u),
    ).toHaveTextContent("not persisted");

    await user.click(
      screen.getByRole("button", { name: "Reset session preview" }),
    );
    await user.click(screen.getByRole("button", { name: "Unresolved items" }));
    expect(screen.getByText("Status: Open")).toBeVisible();
  });

  it("does not report success when governed resolution validation fails", async () => {
    const user = userEvent.setup();
    render(
      <App
        evidenceGovernanceDependencies={{
          uuid: () => "not-a-uuid",
          now: () => "not-a-timestamp",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Unresolved items" }));
    await user.type(
      screen.getByLabelText("Reviewer name"),
      "Synthetic Reviewer",
    );
    await user.type(
      screen.getByLabelText("Resolution rationale"),
      "Synthetic interpretation reviewed.",
    );
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Resolution validation failed",
    );
    expect(screen.getByText("Status: Open")).toBeVisible();
    expect(
      screen.queryByText(/decision was not persisted/u),
    ).not.toBeInTheDocument();
  });

  it("reports governed authoring failure instead of preview success", async () => {
    const user = userEvent.setup();
    let uuidCall = 0;
    render(
      <App
        evidenceGovernanceDependencies={{
          uuid: () => {
            uuidCall += 1;
            return uuidCall === 1
              ? "00000000-0000-4000-8000-000000000901"
              : "not-a-uuid";
          },
          now: () => "2026-07-29T13:00:00.000Z",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Unresolved items" }));
    await user.type(
      screen.getByLabelText("Reviewer name"),
      "Synthetic Reviewer",
    );
    await user.type(
      screen.getByLabelText("Resolution rationale"),
      "Synthetic interpretation reviewed.",
    );
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Status: Resolved")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Rule authoring" }));
    await user.type(
      screen.getByLabelText("Condition value"),
      "all synthetic participants",
    );
    await user.type(
      screen.getByLabelText("Authorized reviewer"),
      "Synthetic Reviewer",
    );
    await user.type(
      screen.getByLabelText("Approval rationale"),
      "Synthetic evidence reviewed.",
    );
    await user.click(
      screen.getByRole("button", { name: "Validate rule preview" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "HASH_COMPUTATION_FAILED",
    );
    expect(
      screen.queryByText(/Governed validation passed/u),
    ).not.toBeInTheDocument();
  });
});
