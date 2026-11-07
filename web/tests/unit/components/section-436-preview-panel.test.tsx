import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { Section436PreviewPanel } from "../../../src/components/case-output/Section436PreviewPanel";
import { section436InputTemplate } from "../../../src/domain/section-436/provisional-preview";
import { parseUuid } from "../../../src/domain/shared/types";

afterEach(cleanup);
const first = parseUuid("00000000-0000-4000-8000-000000000001");
const second = parseUuid("00000000-0000-4000-8000-000000000002");
if (!first.ok || !second.ok) throw new Error("Bad fixture");
const id = first.value;
const otherId = second.value;

function inputFile(value: string) {
  const bytes = new TextEncoder().encode(value);
  const file = new File([bytes], "input.json", { type: "application/json" });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(bytes.buffer.slice(0)),
  });
  return file;
}

it("shows a blocked provisional preview and clears it when the file changes", async () => {
  const user = userEvent.setup();
  render(<Section436PreviewPanel caseId={id} />);
  expect(
    screen.getByText(/Review labels in the file are assertions/),
  ).toBeVisible();
  await user.upload(
    screen.getByLabelText(/Preview input JSON file/),
    inputFile(section436InputTemplate(id)),
  );
  await user.click(
    screen.getByRole("button", { name: "Create provisional preview" }),
  );
  expect(
    await screen.findByText(/Provisional evaluation status: blocked/),
  ).toBeVisible();
  expect(screen.getByText(/Missing facts:/)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Download provisional preview" }),
  ).toBeEnabled();
  await user.upload(
    screen.getByLabelText(/Preview input JSON file/),
    inputFile("{}"),
  );
  expect(
    screen.queryByRole("button", { name: "Download provisional preview" }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Create provisional preview" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /input format or active case ID/,
  );
});

it("does not publish a pending preview after file replacement or case change", async () => {
  const user = userEvent.setup();
  const bytes = new TextEncoder().encode(section436InputTemplate(id));
  let resolveRead: ((value: ArrayBuffer) => void) | undefined;
  const old = new File([bytes], "old.json", { type: "application/json" });
  Object.defineProperty(old, "arrayBuffer", {
    value: () =>
      new Promise<ArrayBuffer>((resolve) => {
        resolveRead = resolve;
      }),
  });
  const view = render(<Section436PreviewPanel key={id} caseId={id} />);
  await user.upload(screen.getByLabelText(/Preview input JSON file/), old);
  await user.click(
    screen.getByRole("button", { name: "Create provisional preview" }),
  );
  await user.upload(
    screen.getByLabelText(/Preview input JSON file/),
    inputFile("{}"),
  );
  resolveRead?.(bytes.buffer.slice(0));
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Create provisional preview" }),
    ).toBeEnabled();
  });
  expect(
    screen.queryByRole("button", { name: "Download provisional preview" }),
  ).not.toBeInTheDocument();
  await user.upload(screen.getByLabelText(/Preview input JSON file/), old);
  await user.click(
    screen.getByRole("button", { name: "Create provisional preview" }),
  );
  view.rerender(<Section436PreviewPanel key={otherId} caseId={otherId} />);
  resolveRead?.(bytes.buffer.slice(0));
  expect(
    screen.getByRole("button", { name: "Create provisional preview" }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Download provisional preview" }),
  ).not.toBeInTheDocument();
});
