import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { expect, test } from "./fixtures";
import { installSyntheticWorkspace } from "./synthetic-workspace";

const ARTIFACT_PATH = resolve("dist/pbgc-caseworkbench.html");

test.describe("Direct-file production acceptance", () => {
  test("loads the built artifact from file:// without console errors or outbound requests", async ({
    offlinePage: page,
    outboundRequests,
  }) => {
    await installSyntheticWorkspace(page);
    await page.goto(pathToFileURL(ARTIFACT_PATH).href);

    await expect(
      page.getByRole("heading", { name: "Evidence intake foundation" }),
    ).toBeVisible();
    await expect(page.locator(".feasibility")).toBeVisible();
    await expect(
      page.getByText("Compatible").or(page.getByText("Not fully compatible")),
    ).toBeVisible();
    expect(outboundRequests).toEqual([]);
  });

  test("reports direct-file mode in feasibility status", async ({
    offlinePage: page,
  }) => {
    await installSyntheticWorkspace(page);
    await page.goto(pathToFileURL(ARTIFACT_PATH).href);

    await expect(page.locator(".feasibility")).toBeVisible();
    await expect(page.locator(".feasibility")).toContainText("direct file");
  });

  test("workspace capability detection works from file://", async ({
    offlinePage: page,
  }) => {
    await installSyntheticWorkspace(page);
    await page.goto(pathToFileURL(ARTIFACT_PATH).href);

    await expect(
      page.getByRole("heading", { name: "Evidence intake foundation" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Select local workspace" }).click();
    await page.getByLabel("Reviewer identifier").fill("capability-tester");
    await page.getByLabel("Reviewer display name").fill("Capability Tester");
    await page.getByRole("button", { name: "Establish identity" }).click();
    await expect(page.getByLabel("Case number")).toBeVisible();
  });

  test("case workflow loads from file://", async ({
    offlinePage: page,
  }) => {
    await installSyntheticWorkspace(page);
    await page.goto(pathToFileURL(ARTIFACT_PATH).href);

    await page.getByRole("button", { name: "Select local workspace" }).click();
    await page.getByLabel("Reviewer identifier").fill("direct-file-reviewer");
    await page.getByLabel("Reviewer display name").fill("Direct File Reviewer");
    await page.getByRole("button", { name: "Establish identity" }).click();
    await page.getByLabel("Case number").fill("PBGC-DIRECT-FILE-001");
    await page.getByRole("button", { name: "Create production case" }).click();

    await expect(page.getByTestId("current-case-id")).toBeVisible();
  });

  test("evidence file import works from file://", async ({
    offlinePage: page,
    outboundRequests,
  }) => {
    await installSyntheticWorkspace(page);
    await page.goto(pathToFileURL(ARTIFACT_PATH).href);

    await page.getByRole("button", { name: "Select local workspace" }).click();
    await page.getByLabel("Reviewer identifier").fill("direct-file-reviewer");
    await page.getByLabel("Reviewer display name").fill("Direct File Reviewer");
    await page.getByRole("button", { name: "Establish identity" }).click();
    await page.getByLabel("Case number").fill("PBGC-DIRECT-FILE-002");
    await page.getByRole("button", { name: "Create production case" }).click();

    await page.getByLabel("Add evidence files").setInputFiles({
      name: "direct-file-evidence.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("direct file evidence content"),
    });

    await expect(
      page.getByRole("heading", { name: "Evidence manifest" }),
    ).toBeVisible();
    await expect(page.getByText("File inventory complete")).toBeVisible();
    expect(outboundRequests).toEqual([]);
  });

  test("governed review UI works from file://", async ({
    offlinePage: page,
  }) => {
    await installSyntheticWorkspace(page);
    await page.goto(pathToFileURL(ARTIFACT_PATH).href);

    await page.getByRole("button", { name: "Select local workspace" }).click();
    await page.getByLabel("Reviewer identifier").fill("direct-file-reviewer");
    await page.getByLabel("Reviewer display name").fill("Direct File Reviewer");
    await page.getByRole("button", { name: "Establish identity" }).click();
    await page.getByLabel("Case number").fill("PBGC-DIRECT-FILE-003");
    await page.getByRole("button", { name: "Create production case" }).click();

    await page.getByLabel("Add evidence files").setInputFiles({
      name: "review-evidence.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("evidence for review"),
    });

    await expect(
      page.getByRole("heading", { name: "Evidence manifest" }),
    ).toBeVisible();

    await expect(page.getByText("Evidence and plan-rule review")).toBeVisible();
  });

  test("architecture workflow loads from file://", async ({
    offlinePage: page,
  }) => {
    await installSyntheticWorkspace(page);
    await page.goto(pathToFileURL(ARTIFACT_PATH).href);

    await page.getByRole("button", { name: "Select local workspace" }).click();
    await page.getByLabel("Reviewer identifier").fill("direct-file-reviewer");
    await page.getByLabel("Reviewer display name").fill("Direct File Reviewer");
    await page.getByRole("button", { name: "Establish identity" }).click();
    await page.getByLabel("Case number").fill("PBGC-DIRECT-FILE-004");
    await page.getByRole("button", { name: "Create production case" }).click();

    await expect(
      page.getByRole("heading", { name: "Architecture" }),
    ).toBeVisible();
  });

  test("zero outbound network requests from file://", async ({
    offlinePage: page,
    outboundRequests,
  }) => {
    await installSyntheticWorkspace(page);
    await page.goto(pathToFileURL(ARTIFACT_PATH).href);

    await page.getByRole("button", { name: "Select local workspace" }).click();
    await page.getByLabel("Reviewer identifier").fill("direct-file-reviewer");
    await page.getByLabel("Reviewer display name").fill("Direct File Reviewer");
    await page.getByRole("button", { name: "Establish identity" }).click();
    await page.getByLabel("Case number").fill("PBGC-DIRECT-FILE-005");
    await page.getByRole("button", { name: "Create production case" }).click();

    await page.getByLabel("Add evidence files").setInputFiles({
      name: "network-test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("network test content"),
    });

    await expect(
      page.getByRole("heading", { name: "Evidence manifest" }),
    ).toBeVisible();

    expect(outboundRequests).toEqual([]);
  });
});
