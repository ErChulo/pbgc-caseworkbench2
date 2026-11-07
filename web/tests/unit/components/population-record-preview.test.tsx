import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PopulationRecordPreview } from "../../../src/components/review/PopulationRecordPreview";
import type { PopulationReviewItem } from "../../../src/components/review/PopulationReview";
import type { PopulationRecordProjection } from "../../../src/domain/population/record-projection";
import { parseSha256 } from "../../../src/domain/shared/types";

afterEach(cleanup);
const parsed = parseSha256("a".repeat(64));
if (!parsed.ok) throw new Error("Bad hash");
const item = {} as PopulationReviewItem;
const record: PopulationRecordProjection = {
  workbookProfileContentSha256: parsed.value,
  populationDecisionId: "synthetic",
  sheetName: "Synthetic",
  sourceRow: 2,
  fields: [
    {
      field: "AMOUNT",
      sourceAddress: "B2",
      state: "value",
      value: 0,
      formulaText: null,
    },
    {
      field: "OTHER",
      sourceAddress: "C2",
      state: "formula",
      value: null,
      formulaText: "1+1",
    },
  ],
  hasOnlyValues: false,
  recordContentSha256: parsed.value,
};
async function enterBinding(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Generic field 1"), "AMOUNT");
  await user.type(screen.getByLabelText("Source column 1"), "B");
  await user.type(screen.getByLabelText("Exact row-one header 1"), "Amount");
}

it("requires explicit selection, displays preserved states and clears sensitive values", async () => {
  const onPreview = vi.fn().mockResolvedValue(record);
  const user = userEvent.setup();
  render(<PopulationRecordPreview item={item} onPreview={onPreview} />);
  await user.click(
    screen.getByRole("button", { name: "Inspect source row locally" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(/exact sheet name/);
  await user.type(screen.getByLabelText("Source sheet name"), "Synthetic");
  await user.type(screen.getByLabelText("Source row number"), "2");
  await enterBinding(user);
  await user.click(
    screen.getByRole("button", { name: "Inspect source row locally" }),
  );
  expect(await screen.findByText(/Source row: 2/)).toBeVisible();
  expect(
    screen.getByText('"AMOUNT"', { selector: "strong" }).closest("li"),
  ).toHaveTextContent("B2: value — 0");
  expect(screen.getByText(/"OTHER"/).closest("li")).toHaveTextContent(
    "C2: formula",
  );
  expect(screen.queryByText("1+1")).not.toBeInTheDocument();
  expect(onPreview).toHaveBeenCalledWith(item, {
    sheetName: "Synthetic",
    sourceRow: 2,
    bindings: [{ field: "AMOUNT", column: "B", expectedHeader: "Amount" }],
  });
  await user.click(
    screen.getByRole("button", { name: "Clear local row view" }),
  );
  expect(screen.queryByText(/Source row: 2/)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Source sheet name")).toHaveValue("");
  expect(screen.getByLabelText("Source row number")).toHaveValue("");
});

it("does not publish an in-flight row after the selection changes or the view unmounts", async () => {
  let resolve: ((value: PopulationRecordProjection) => void) | undefined;
  const onPreview = vi.fn(
    () =>
      new Promise<PopulationRecordProjection>((done) => {
        resolve = done;
      }),
  );
  const user = userEvent.setup();
  const view = render(
    <PopulationRecordPreview item={item} onPreview={onPreview} />,
  );
  await user.type(screen.getByLabelText("Source sheet name"), "Synthetic");
  await user.type(screen.getByLabelText("Source row number"), "2");
  await enterBinding(user);
  await user.click(
    screen.getByRole("button", { name: "Inspect source row locally" }),
  );
  await user.clear(screen.getByLabelText("Source row number"));
  resolve?.(record);
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Inspect source row locally" }),
    ).toBeEnabled();
  });
  expect(screen.queryByText(/Source row: 2/)).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Source row number"), "2");
  await user.click(
    screen.getByRole("button", { name: "Inspect source row locally" }),
  );
  view.unmount();
  resolve?.(record);
  expect(screen.queryByText(/Source row: 2/)).not.toBeInTheDocument();
});

it("adds and removes explicit bindings and clears results when a binding changes", async () => {
  const onPreview = vi.fn().mockResolvedValue(record);
  const user = userEvent.setup();
  render(<PopulationRecordPreview item={item} onPreview={onPreview} />);
  await user.type(screen.getByLabelText("Source sheet name"), "Synthetic");
  await user.type(screen.getByLabelText("Source row number"), "2");
  await enterBinding(user);
  await user.click(screen.getByRole("button", { name: "Add field binding" }));
  await user.click(
    screen.getByRole("button", { name: "Inspect source row locally" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(/Each binding needs/);
  expect(onPreview).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("Generic field 2"), "OTHER");
  await user.type(screen.getByLabelText("Source column 2"), "C");
  await user.type(screen.getByLabelText("Exact row-one header 2"), "Other");
  await user.click(
    screen.getByRole("button", { name: "Inspect source row locally" }),
  );
  expect(await screen.findByText(/Source row: 2/)).toBeVisible();
  expect(onPreview).toHaveBeenCalledWith(item, {
    sheetName: "Synthetic",
    sourceRow: 2,
    bindings: [
      { field: "AMOUNT", column: "B", expectedHeader: "Amount" },
      { field: "OTHER", column: "C", expectedHeader: "Other" },
    ],
  });
  await user.click(
    screen.getByRole("button", { name: "Remove field binding 1" }),
  );
  expect(screen.queryByText(/Source row: 2/)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Generic field 1")).toHaveValue("OTHER");
  expect(
    screen.getByRole("button", { name: "Remove field binding 1" }),
  ).toBeDisabled();
});

it("caps binding rows and rejects an oversized combined selection", () => {
  const onPreview = vi.fn().mockResolvedValue(record);
  render(<PopulationRecordPreview item={item} onPreview={onPreview} />);
  fireEvent.change(screen.getByLabelText("Source sheet name"), {
    target: { value: "Synthetic" },
  });
  fireEvent.change(screen.getByLabelText("Source row number"), {
    target: { value: "2" },
  });
  for (let index = 1; index <= 50; index++) {
    fireEvent.change(screen.getByLabelText(`Generic field ${String(index)}`), {
      target: { value: "A".repeat(512) },
    });
    fireEvent.change(screen.getByLabelText(`Source column ${String(index)}`), {
      target: { value: "A" },
    });
    fireEvent.change(
      screen.getByLabelText(`Exact row-one header ${String(index)}`),
      { target: { value: "Header" } },
    );
    if (index < 50)
      fireEvent.click(
        screen.getByRole("button", { name: "Add field binding" }),
      );
  }
  expect(
    screen.getByRole("button", { name: "Add field binding" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect source row locally" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(/no larger than 16 KiB/);
  expect(onPreview).not.toHaveBeenCalled();
}, 20_000);
