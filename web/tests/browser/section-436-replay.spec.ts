import { expect, test } from "./fixtures";
import { createSyntheticCase } from "./synthetic-workspace";
import { evaluateSection436 } from "../../src/domain/section-436/evaluation";
import { parseUtcTimestamp, parseUuid } from "../../src/domain/shared/types";

test("checks a synthetic local Section 436 evaluation without clearing package blockers", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await createSyntheticCase(page, "PBGC-SECTION-436-REPLAY-001");
  const caseId = parseUuid(
    (await page.getByTestId("current-case-id").textContent()) ?? "",
  );
  const timestamp = parseUtcTimestamp("2026-11-06T00:00:00.000Z");
  if (!caseId.ok || !timestamp.ok) throw new Error("Invalid synthetic fixture");
  const evaluation = await evaluateSection436({
    caseId: caseId.value,
    facts: [],
    rules: [],
    evaluatedAt: timestamp.value,
    evaluatedBy: null,
  });
  const panel = page.getByRole("region", {
    name: "Check a Section 436 evaluation",
  });
  await panel.getByLabel(/Evaluation JSON file/).setInputFiles({
    name: "synthetic-evaluation.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(evaluation)),
  });
  await panel.getByRole("button", { name: "Check local evaluation" }).click();
  await expect(
    panel.getByText(/Local replay matched. Evaluation status: blocked/),
  ).toBeVisible();
  await expect(
    panel.getByText(/not approval or independent validation/),
  ).toBeVisible();
  const stage = page
    .locator("li.case-output-stage")
    .filter({ hasText: "Section 436 evaluation" });
  await expect(stage).toContainText("Required · blocked");
  const altered = {
    ...evaluation,
    deterministicPayload: {
      ...evaluation.deterministicPayload,
      conclusionCode: "restriction-applies",
    },
  };
  await panel.getByLabel(/Evaluation JSON file/).setInputFiles({
    name: "altered.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(altered)),
  });
  await expect(panel.getByText(/Local replay matched/)).not.toBeVisible();
  await panel.getByRole("button", { name: "Check local evaluation" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "content hash does not match",
  );
  expect(outboundRequests).toEqual([]);
});
