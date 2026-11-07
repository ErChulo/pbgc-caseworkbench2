import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { Section436PreviewVerificationPanel } from "../../../src/components/case-output/Section436PreviewVerificationPanel";
import {
  createProvisionalSection436Preview,
  section436InputTemplate,
} from "../../../src/domain/section-436/provisional-preview";
import { parseUtcTimestamp, parseUuid } from "../../../src/domain/shared/types";

afterEach(cleanup);
const first = parseUuid("00000000-0000-4000-8000-000000000001");
const second = parseUuid("00000000-0000-4000-8000-000000000002");
const time = parseUtcTimestamp("2026-11-06T00:00:00.000Z");
if (!first.ok || !second.ok || !time.ok) throw new Error("Bad fixture");
const id = first.value,
  otherId = second.value,
  at = time.value;
function file(bytes: Uint8Array<ArrayBuffer>, name: string) {
  const item = new File([bytes], name, { type: "application/json" });
  Object.defineProperty(item, "arrayBuffer", {
    value: () => Promise.resolve(bytes.buffer.slice(0)),
  });
  return item;
}

it("checks two files and clears the result when either file changes", async () => {
  const source = new TextEncoder().encode(section436InputTemplate(id));
  const preview = await createProvisionalSection436Preview(source, id, at);
  const user = userEvent.setup();
  render(<Section436PreviewVerificationPanel caseId={id} />);
  await user.upload(
    screen.getByLabelText(/Provisional preview JSON file/),
    file(preview.bytes, "preview.json"),
  );
  await user.upload(
    screen.getByLabelText(/Original preview input JSON file/),
    file(source, "source.json"),
  );
  await user.click(
    screen.getByRole("button", { name: "Check preview and input" }),
  );
  expect(
    await screen.findByText(
      /Local regeneration matched. Evaluation status: blocked/,
    ),
  ).toBeVisible();
  expect(
    screen.getByText(/not approval or independent validation/),
  ).toBeVisible();
  await user.upload(
    screen.getByLabelText(/Original preview input JSON file/),
    file(new TextEncoder().encode("{}"), "wrong.json"),
  );
  expect(
    screen.queryByText(/Local regeneration matched/),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Check preview and input" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(/input file hash/);
});

it("ignores pending reads after a file replacement and case switch", async () => {
  const source = new TextEncoder().encode(section436InputTemplate(id));
  const preview = await createProvisionalSection436Preview(source, id, at);
  let resolveRead: ((value: ArrayBuffer) => void) | undefined;
  const delayed = new File([preview.bytes], "preview.json", {
    type: "application/json",
  });
  Object.defineProperty(delayed, "arrayBuffer", {
    value: () =>
      new Promise<ArrayBuffer>((resolve) => {
        resolveRead = resolve;
      }),
  });
  const user = userEvent.setup();
  const view = render(
    <Section436PreviewVerificationPanel key={id} caseId={id} />,
  );
  const previewInput = screen.getByLabelText(/Provisional preview JSON file/);
  await user.upload(previewInput, delayed);
  await user.upload(
    screen.getByLabelText(/Original preview input JSON file/),
    file(source, "source.json"),
  );
  await user.click(
    screen.getByRole("button", { name: "Check preview and input" }),
  );
  await user.upload(previewInput, file(preview.bytes, "new.json"));
  resolveRead?.(preview.bytes.buffer.slice(0));
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Check preview and input" }),
    ).toBeEnabled();
  });
  expect(
    screen.queryByText(/Local regeneration matched/),
  ).not.toBeInTheDocument();
  await user.upload(previewInput, delayed);
  await user.click(
    screen.getByRole("button", { name: "Check preview and input" }),
  );
  view.rerender(
    <Section436PreviewVerificationPanel key={otherId} caseId={otherId} />,
  );
  resolveRead?.(preview.bytes.buffer.slice(0));
  expect(
    screen.getByRole("button", { name: "Check preview and input" }),
  ).toBeDisabled();
  expect(
    screen.queryByText(/Local regeneration matched/),
  ).not.toBeInTheDocument();
});
