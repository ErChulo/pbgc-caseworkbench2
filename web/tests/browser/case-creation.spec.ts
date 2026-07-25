/* eslint-disable @typescript-eslint/require-await */
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

async function installSyntheticWorkspace(page: Page) {
  await page.addInitScript(() => {
    const files = new Map<string, Uint8Array>();
    const directories = new Map<string, FileSystemDirectoryHandle>();

    const makeDirectory = (prefix: string): FileSystemDirectoryHandle => {
      const cached = directories.get(prefix);
      if (cached) return cached;
      const handle = {
        kind: "directory",
        name: prefix.split("/").at(-1) ?? "synthetic-local-workspace",
        isSameEntry: async (other: FileSystemHandle) => other === handle,
        queryPermission: async () => "granted" as PermissionState,
        requestPermission: async () => "granted" as PermissionState,
        getDirectoryHandle: async (
          name: string,
          options?: FileSystemGetDirectoryOptions,
        ) => {
          const path = prefix ? `${prefix}/${name}` : name;
          if (!options?.create && !directories.has(path)) {
            throw new DOMException("Not found", "NotFoundError");
          }
          return makeDirectory(path);
        },
        getFileHandle: async (
          name: string,
          options?: FileSystemGetFileOptions,
        ) => {
          const path = prefix ? `${prefix}/${name}` : name;
          if (!options?.create && !files.has(path)) {
            throw new DOMException("Not found", "NotFoundError");
          }
          return {
            kind: "file",
            name,
            isSameEntry: async () => false,
            queryPermission: async () => "granted" as PermissionState,
            requestPermission: async () => "granted" as PermissionState,
            getFile: async () => {
              const stored = Uint8Array.from(
                files.get(path) ?? new Uint8Array(),
              );
              return new File([stored.buffer], name, {
                type: "application/json",
              });
            },
            createWritable: async () => ({
              locked: false,
              abort: async () => undefined,
              close: async () => undefined,
              getWriter: () => {
                throw new Error("Writer access is not used by this test.");
              },
              seek: async () => undefined,
              truncate: async () => undefined,
              write: async (data: FileSystemWriteChunkType) => {
                if (data instanceof Uint8Array) {
                  files.set(path, Uint8Array.from(data));
                  return;
                }
                if (data instanceof ArrayBuffer) {
                  files.set(path, new Uint8Array(data));
                  return;
                }
                throw new Error("Unsupported synthetic write type.");
              },
            }),
          } as unknown as FileSystemFileHandle;
        },
        removeEntry: async () => undefined,
        resolve: async () => null,
      } as unknown as FileSystemDirectoryHandle;
      directories.set(prefix, handle);
      return handle;
    };

    Object.defineProperty(globalThis, "showDirectoryPicker", {
      configurable: true,
      value: async () => makeDirectory(""),
    });
  });
}

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
  await page.getByLabel("Reviewer identifier").fill("synthetic-reviewer");
  await page.getByLabel("Reviewer display name").fill("Synthetic Reviewer");
  await page
    .getByLabel("Authoritative PBGC case identifier")
    .fill("PBGC-SYNTHETIC-001");
  await page.getByRole("button", { name: "Create production case" }).click();

  const caseId = await page.getByTestId("current-case-id").textContent();
  expect(caseId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
  await expect(page.getByText("Production case created")).toBeVisible();

  await page.getByRole("button", { name: "Create another case" }).click();
  await page
    .getByLabel("Authoritative PBGC case identifier")
    .fill("PBGC-SYNTHETIC-001");
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

  await expect(page.getByText("Resume decision recorded")).toBeVisible();
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
  await page
    .getByLabel("Authoritative PBGC case identifier")
    .fill("PBGC-SYNTHETIC-002");
  await page.getByRole("button", { name: "Create production case" }).click();
  const productionId = await page.getByTestId("current-case-id").textContent();

  await page.getByRole("button", { name: "Create another case" }).click();
  await page
    .getByLabel("Authoritative PBGC case identifier")
    .fill("PBGC-SYNTHETIC-002");
  await page.getByRole("button", { name: "Create production case" }).click();
  await page
    .getByLabel("Decision rationale")
    .fill("Approved training exercise.");
  await page.getByLabel("Non-production purpose").selectOption("training");
  await page
    .getByRole("button", { name: "Create approved non-production case" })
    .click();

  await expect(page.getByText("Training case created")).toBeVisible();
  await expect(page.getByTestId("current-case-id")).not.toHaveText(
    productionId ?? "",
  );
  await expect(
    page.getByText("Human collision decision recorded"),
  ).toBeVisible();
});
