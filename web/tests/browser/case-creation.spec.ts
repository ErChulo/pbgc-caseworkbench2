import { expect, test } from "./fixtures";
import { installSyntheticWorkspace } from "./synthetic-workspace";

test("creates one production case and requires an explicit duplicate decision", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await installSyntheticWorkspace(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Create a controlled case" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Select local workspace" }).click();

  // Reviewer identity is requested once after workspace is opened
  await expect(page.getByLabel("Reviewer identifier")).toBeVisible();
  await expect(page.getByLabel("Reviewer display name")).toBeVisible();
  await expect(
    page.getByText(/local audit trail during this browser session/u),
  ).toBeVisible();

  await page.getByLabel("Reviewer identifier").fill("synthetic-reviewer");
  await page.getByLabel("Reviewer display name").fill("Synthetic Reviewer");
  await page.getByRole("button", { name: "Establish identity" }).click();

  // After identity is established, existing cases and Create New Case are visible
  await expect(
    page.getByRole("button", { name: "Create production case" }),
  ).toBeVisible();

  // New case form asks only for the PBGC case number
  await expect(page.getByLabel("Reviewer identifier")).not.toBeVisible();
  await page.getByLabel("Case number").fill("PBGC-SYNTHETIC-001");
  await page.getByRole("button", { name: "Create production case" }).click();

  // New case automatically becomes active
  const caseId = await page.getByTestId("current-case-id").textContent();
  expect(caseId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
  await expect(page.getByTestId("active-case-authoritative-id")).toHaveText(
    "PBGC-SYNTHETIC-001",
  );
  await expect(page.getByText("Active case")).toBeVisible();

  // Return to workspace home and create a duplicate to trigger collision
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByLabel("Case number").fill("PBGC-SYNTHETIC-001");
  await page.getByRole("button", { name: "Create production case" }).click();

  await expect(
    page.getByRole("heading", { name: "Existing case found" }),
  ).toBeVisible();
  await expect(page.getByTestId("existing-case-id")).toHaveText(caseId ?? "");
  await expect(
    page.getByText("No second production case was created"),
  ).toBeVisible();

  await page
    .getByLabel("Decision rationale")
    .fill("Continue controlled intake in the existing synthetic case.");
  await page.getByRole("button", { name: "Resume existing case" }).click();

  // Resumed case is active again — same internal ID, no duplicate created
  await expect(page.getByTestId("current-case-id")).toHaveText(caseId ?? "");
  expect(outboundRequests).toEqual([]);
});

test("creates a separately designated non-production case only after human approval", async ({
  page,
}) => {
  await installSyntheticWorkspace(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Select local workspace" }).click();
  await page.getByLabel("Reviewer identifier").fill("synthetic-reviewer");
  await page.getByLabel("Reviewer display name").fill("Synthetic Reviewer");
  await page.getByRole("button", { name: "Establish identity" }).click();
  await page.getByLabel("Case number").fill("PBGC-SYNTHETIC-002");
  await page.getByRole("button", { name: "Create production case" }).click();
  const productionId = await page.getByTestId("current-case-id").textContent();

  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await page.getByLabel("Case number").fill("PBGC-SYNTHETIC-002");
  await page.getByRole("button", { name: "Create production case" }).click();
  await page
    .getByLabel("Decision rationale")
    .fill("Approved training exercise.");
  await page.getByLabel("Non-production purpose").selectOption("training");
  await page
    .getByRole("button", { name: "Create approved non-production case" })
    .click();

  await expect(page.getByTestId("active-case-authoritative-id")).toHaveText(
    "PBGC-SYNTHETIC-002",
  );
  await expect(page.getByTestId("current-case-id")).not.toHaveText(
    productionId ?? "",
  );
});

test("opens an existing case from the workspace case list without duplicating data", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await installSyntheticWorkspace(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Select local workspace" }).click();
  await page.getByLabel("Reviewer identifier").fill("synthetic-reviewer");
  await page.getByLabel("Reviewer display name").fill("Synthetic Reviewer");
  await page.getByRole("button", { name: "Establish identity" }).click();

  await page.getByLabel("Case number").fill("PBGC-SYNTHETIC-OPEN");
  await page.getByRole("button", { name: "Create production case" }).click();

  const caseId = await page.getByTestId("current-case-id").textContent();
  expect(caseId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );

  // Return to workspace home — the existing case should appear in the list
  await page.getByRole("button", { name: "Return to workspace home" }).click();
  await expect(
    page.getByRole("button", { name: "Open PBGC-SYNTHETIC-OPEN" }),
  ).toBeVisible();

  // Open the existing case
  await page.getByRole("button", { name: "Open PBGC-SYNTHETIC-OPEN" }).click();

  // The same internal case ID is active — no duplicate was created
  await expect(page.getByTestId("current-case-id")).toHaveText(caseId ?? "");
  await expect(page.getByTestId("active-case-authoritative-id")).toHaveText(
    "PBGC-SYNTHETIC-OPEN",
  );
  expect(outboundRequests).toEqual([]);
});

test("displays updated evidence-intake labels and workspace-versus-source explanation", async ({
  offlinePage: page,
}) => {
  await installSyntheticWorkspace(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Select local workspace" }).click();
  await page.getByLabel("Reviewer identifier").fill("synthetic-reviewer");
  await page.getByLabel("Reviewer display name").fill("Synthetic Reviewer");
  await page.getByRole("button", { name: "Establish identity" }).click();
  await page.getByLabel("Case number").fill("PBGC-SYNTHETIC-EVIDENCE");
  await page.getByRole("button", { name: "Create production case" }).click();

  await expect(page.getByLabel("Add evidence files")).toBeVisible();
  await expect(page.getByLabel("Import evidence folder")).toBeVisible();
  await expect(
    page.getByText(/Source evidence vs\. controlled workspace/u),
  ).toBeVisible();

  // Built-in Help is hidden from the primary workflow when a case is active
  await expect(
    page.getByRole("heading", { name: "Built-in help" }),
  ).not.toBeVisible();
  await expect(page.getByText("Keyboard shortcuts")).not.toBeVisible();
  await expect(page.getByText("Local PII handling")).not.toBeVisible();
  await expect(page.getByText("Help", { exact: true })).not.toBeVisible();

  // Synthetic/demo content is not displayed as if it belongs to the production case
  await expect(page.getByText("Synthetic session preview")).not.toBeVisible();
  await expect(
    page.getByText("Typed synthetic demo candidates"),
  ).not.toBeVisible();
  await expect(page.getByText("Synthetic demo catalog")).not.toBeVisible();

  // Neutral case-derived empty state appears when no review records exist
  await expect(
    page.getByText(
      "No case-derived evidence review records are available yet.",
    ),
  ).toBeVisible();
});
