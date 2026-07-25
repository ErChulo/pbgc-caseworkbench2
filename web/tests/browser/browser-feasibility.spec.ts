import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { expect, test } from "./fixtures";

test("static-origin bootstrap is self-contained and makes no outbound requests", async ({
  offlinePage: page,
  outboundRequests,
  localWorkspacePath,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Evidence intake foundation" }),
  ).toBeVisible();
  await expect(page.locator('[data-feasibility="pass"]')).toBeVisible();

  expect(outboundRequests).toEqual([]);
  expect(localWorkspacePath).toContain("synthetic-local-workspace");
});

test("application labels the implementation maturity and data boundary", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByLabel("Current implementation maturity: controlled case intake"),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText(
    "No case data leaves this device",
  );
});

test("built artifact reports direct-file capability without network access", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  const artifact = pathToFileURL(resolve("dist/pbgc-caseworkbench.html")).href;
  await page.goto(artifact);

  await expect(page.getByText(/Mode:/)).toContainText("direct-file");
  await expect(page.locator('[data-feasibility="fail"]')).toBeVisible();
  await expect(page.getByText("worker").locator("..")).toContainText("Fail");
  await expect(page.getByText(/File System Access API:/)).toContainText(
    "available",
  );
  expect(outboundRequests).toEqual([]);
});
