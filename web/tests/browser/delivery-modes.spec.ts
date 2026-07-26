import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { expect, test } from "./fixtures";
import { installSyntheticWorkspace } from "./synthetic-workspace";

test("supports the approved direct-file acceptance check without outbound requests", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  test.skip(
    test.info().project.name === "edge",
    "Edge direct-file is not approved.",
  );
  const artifact = pathToFileURL(resolve("dist/pbgc-caseworkbench.html")).href;
  await page.goto(artifact);

  await expect(
    page.getByRole("heading", { name: "Evidence intake foundation" }),
  ).toBeVisible();
  await expect(page.locator(".feasibility")).toBeVisible();
  expect(outboundRequests).toEqual([]);
});

test("supports the approved localhost static-origin fallback without a server-side data path", async ({
  offlinePage: page,
  outboundRequests,
}) => {
  await installSyntheticWorkspace(page);
  await page.goto("/");

  await expect(page.getByText("Browser:")).toContainText("Compatible");
  await page.getByRole("button", { name: "Show technical details" }).click();
  await expect(page.getByText(/File System Access API:/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Evidence intake foundation" }),
  ).toBeVisible();
  await expect(page.getByText("No case data leaves this device")).toBeVisible();
  expect(outboundRequests).toEqual([]);
});
