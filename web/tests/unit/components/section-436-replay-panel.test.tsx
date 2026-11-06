import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { Section436ReplayPanel } from "../../../src/components/case-output/Section436ReplayPanel";
import { evaluateSection436 } from "../../../src/domain/section-436/evaluation";
import { parseUtcTimestamp, parseUuid } from "../../../src/domain/shared/types";

afterEach(cleanup);

it("checks a local evaluation without claiming approval, and clears the result on file change", async () => {
  const caseId = parseUuid("00000000-0000-4000-8000-000000000001");
  const time = parseUtcTimestamp("2026-11-06T00:00:00.000Z");
  if (!caseId.ok || !time.ok) throw new Error("Bad fixture");
  const evaluation = await evaluateSection436({
    caseId: caseId.value,
    facts: [],
    rules: [],
    evaluatedAt: time.value,
    evaluatedBy: null,
  });
  const data = new TextEncoder().encode(JSON.stringify(evaluation));
  const file = new File([data], "evaluation.json", {
    type: "application/json",
  });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(data.buffer.slice(0)),
  });
  const user = userEvent.setup();
  render(<Section436ReplayPanel caseId={caseId.value} />);
  await user.upload(screen.getByLabelText(/Evaluation JSON file/), file);
  await user.click(
    screen.getByRole("button", { name: "Check local evaluation" }),
  );
  expect(
    await screen.findByText(/Local replay matched. Evaluation status: blocked/),
  ).toBeVisible();
  expect(
    screen.getByText(/not approval or independent validation/),
  ).toBeVisible();
  await user.upload(
    screen.getByLabelText(/Evaluation JSON file/),
    new File(["{}"], "other.json", { type: "application/json" }),
  );
  expect(screen.queryByText(/Local replay matched/)).not.toBeInTheDocument();
});

it("does not publish a result when a pending file is replaced", async () => {
  const caseId = parseUuid("00000000-0000-4000-8000-000000000001");
  const time = parseUtcTimestamp("2026-11-06T00:00:00.000Z");
  if (!caseId.ok || !time.ok) throw new Error("Bad fixture");
  const evaluation = await evaluateSection436({
    caseId: caseId.value,
    facts: [],
    rules: [],
    evaluatedAt: time.value,
    evaluatedBy: null,
  });
  const data = new TextEncoder().encode(JSON.stringify(evaluation));
  let resolveRead: ((value: ArrayBuffer) => void) | undefined;
  const oldFile = new File([data], "old.json", { type: "application/json" });
  Object.defineProperty(oldFile, "arrayBuffer", {
    value: () =>
      new Promise<ArrayBuffer>((resolve) => {
        resolveRead = resolve;
      }),
  });
  const user = userEvent.setup();
  render(<Section436ReplayPanel caseId={caseId.value} />);
  const input = screen.getByLabelText(/Evaluation JSON file/);
  await user.upload(input, oldFile);
  await user.click(
    screen.getByRole("button", { name: "Check local evaluation" }),
  );
  await user.upload(
    input,
    new File(["{}"], "new.json", { type: "application/json" }),
  );
  resolveRead?.(data.buffer.slice(0));
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Check local evaluation" }),
    ).toBeEnabled();
  });
  expect(screen.queryByText(/Local replay matched/)).not.toBeInTheDocument();
});

it("discards a pending read when the active case changes", async () => {
  const first = parseUuid("00000000-0000-4000-8000-000000000001");
  const second = parseUuid("00000000-0000-4000-8000-000000000002");
  const time = parseUtcTimestamp("2026-11-06T00:00:00.000Z");
  if (!first.ok || !second.ok || !time.ok) throw new Error("Bad fixture");
  const evaluation = await evaluateSection436({
    caseId: first.value,
    facts: [],
    rules: [],
    evaluatedAt: time.value,
    evaluatedBy: null,
  });
  const data = new TextEncoder().encode(JSON.stringify(evaluation));
  let resolveRead: ((value: ArrayBuffer) => void) | undefined;
  const file = new File([data], "old.json", { type: "application/json" });
  Object.defineProperty(file, "arrayBuffer", {
    value: () =>
      new Promise<ArrayBuffer>((resolve) => {
        resolveRead = resolve;
      }),
  });
  const user = userEvent.setup();
  const view = render(
    <Section436ReplayPanel key={first.value} caseId={first.value} />,
  );
  await user.upload(screen.getByLabelText(/Evaluation JSON file/), file);
  await user.click(
    screen.getByRole("button", { name: "Check local evaluation" }),
  );
  view.rerender(
    <Section436ReplayPanel key={second.value} caseId={second.value} />,
  );
  resolveRead?.(data.buffer.slice(0));
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Check local evaluation" }),
    ).toBeDisabled();
  });
  expect(screen.queryByText(/Local replay matched/)).not.toBeInTheDocument();
});
