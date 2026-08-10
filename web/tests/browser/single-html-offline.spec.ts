import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { expect, test } from "./fixtures";
import { installSyntheticWorkspace } from "./synthetic-workspace";

test("loads the single-file artifact offline without console errors", async ({
  page,
  outboundRequests,
}) => {
  test.skip(
    test.info().project.name === "edge",
    "Edge direct-file is not approved.",
  );
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await installSyntheticWorkspace(page);
  await page.goto(pathToFileURL(resolve("dist/pbgc-caseworkbench.html")).href);

  await expect(
    page.getByRole("heading", { name: "Evidence intake foundation" }),
  ).toBeVisible();
  await expect(page.locator(".feasibility")).toBeVisible();
  expect(outboundRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("completes the offline local flow with outbound requests blocked", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await installSyntheticWorkspace(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Select local workspace" }).click();
  await page.getByLabel("Reviewer identifier").fill("offline-reviewer");
  await page.getByLabel("Reviewer display name").fill("Offline Reviewer");
  await page.getByRole("button", { name: "Establish identity" }).click();
  await page.getByLabel("Case number").fill("PBGC-OFFLINE-001");
  await page.getByRole("button", { name: "Create production case" }).click();
  await page.getByLabel("Add evidence files").setInputFiles({
    name: "offline.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("offline synthetic evidence"),
  });

  await expect(
    page.getByRole("heading", { name: "Evidence manifest" }),
  ).toBeVisible();
  await expect(page.getByText("File inventory complete")).toBeVisible();
  expect(outboundRequests).toEqual([]);
});
