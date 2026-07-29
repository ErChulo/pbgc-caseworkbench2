import { expect, test } from "./fixtures";

const STATE_KEY = "pbgc-synthetic-workspace-state";

async function installPersistentWorkspace(
  page: import("@playwright/test").Page,
) {
  await page.addInitScript(
    ({ stateKey }) => {
      interface WorkspaceState {
        directories: string[];
        files: Record<string, number[]>;
        revoked: boolean;
      }

      const loadState = (): WorkspaceState => {
        const raw = localStorage.getItem(stateKey);
        if (!raw) return { directories: [], files: {}, revoked: false };
        try {
          const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
          return {
            directories: Array.isArray(parsed.directories)
              ? parsed.directories.filter(
                  (value): value is string => typeof value === "string",
                )
              : [],
            files:
              parsed.files && typeof parsed.files === "object"
                ? Object.fromEntries(
                    Object.entries(parsed.files).filter(([, value]) =>
                      Array.isArray(value),
                    ),
                  )
                : {},
            revoked: Boolean(parsed.revoked),
          };
        } catch {
          return { directories: [], files: {}, revoked: false };
        }
      };

      const saveState = (state: WorkspaceState) => {
        localStorage.setItem(stateKey, JSON.stringify(state));
      };

      const makeDirectory = (
        prefix: string,
        state: WorkspaceState,
      ): FileSystemDirectoryHandle => {
        const handle = {
          kind: "directory",
          name: prefix.split("/").at(-1) ?? "synthetic-local-workspace",
          isSameEntry: (other: FileSystemHandle) =>
            Promise.resolve(other === handle),
          queryPermission: () =>
            Promise.resolve(
              (state.revoked ? "denied" : "granted") as PermissionState,
            ),
          requestPermission: () =>
            Promise.resolve(
              (state.revoked ? "denied" : "granted") as PermissionState,
            ),
          getDirectoryHandle: (
            name: string,
            options?: FileSystemGetDirectoryOptions,
          ) =>
            Promise.resolve().then(() => {
              if (state.revoked) {
                throw new DOMException("Permission revoked", "NotAllowedError");
              }
              const path = prefix ? `${prefix}/${name}` : name;
              const existing = state.directories.includes(path);
              if (!options?.create && !existing) {
                throw new DOMException("Not found", "NotFoundError");
              }
              if (!existing) {
                state.directories.push(path);
                saveState(state);
              }
              return makeDirectory(path, state);
            }),
          getFileHandle: (name: string, options?: FileSystemGetFileOptions) =>
            Promise.resolve().then(() => {
              if (state.revoked) {
                throw new DOMException("Permission revoked", "NotAllowedError");
              }
              const path = prefix ? `${prefix}/${name}` : name;
              const existing = path in state.files;
              if (!options?.create && !existing) {
                throw new DOMException("Not found", "NotFoundError");
              }
              if (!existing) {
                state.files[path] = [];
                saveState(state);
              }
              return {
                kind: "file",
                name,
                isSameEntry: () => Promise.resolve(false),
                queryPermission: () =>
                  Promise.resolve(
                    (state.revoked ? "denied" : "granted") as PermissionState,
                  ),
                requestPermission: () =>
                  Promise.resolve(
                    (state.revoked ? "denied" : "granted") as PermissionState,
                  ),
                getFile: () =>
                  Promise.resolve().then(() => {
                    if (state.revoked) {
                      throw new DOMException(
                        "Permission revoked",
                        "NotAllowedError",
                      );
                    }
                    const stored = Uint8Array.from(state.files[path] ?? []);
                    return new File([stored.buffer], name, {
                      type: "application/octet-stream",
                    });
                  }),
                createWritable: () =>
                  Promise.resolve({
                    locked: false,
                    abort: () => Promise.resolve(undefined),
                    close: () =>
                      Promise.resolve().then(() => {
                        saveState(state);
                      }),
                    getWriter: () => {
                      throw new Error(
                        "Writer access is not used by this test.",
                      );
                    },
                    seek: () => Promise.resolve(undefined),
                    truncate: () => Promise.resolve(undefined),
                    write: (data: FileSystemWriteChunkType) =>
                      Promise.resolve().then(() => {
                        if (state.revoked) {
                          throw new DOMException(
                            "Permission revoked",
                            "NotAllowedError",
                          );
                        }
                        if (data instanceof Uint8Array) {
                          state.files[path] = Array.from(data);
                          saveState(state);
                          return;
                        }
                        if (data instanceof ArrayBuffer) {
                          state.files[path] = Array.from(new Uint8Array(data));
                          saveState(state);
                          return;
                        }
                        throw new Error("Unsupported synthetic write type.");
                      }),
                  }),
              } as unknown as FileSystemFileHandle;
            }),
          removeEntry: () => Promise.resolve(undefined),
          resolve: () => Promise.resolve(null),
        } as unknown as FileSystemDirectoryHandle;
        return handle;
      };

      Object.defineProperty(globalThis, "showDirectoryPicker", {
        configurable: true,
        value: () =>
          Promise.resolve().then(() => {
            const state = loadState();
            if (state.revoked) {
              throw new DOMException("Permission revoked", "NotAllowedError");
            }
            return makeDirectory("", state);
          }),
      });
    },
    { stateKey: STATE_KEY },
  );
}

test("reports unsupported browsers as non-production sessions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(globalThis, "showDirectoryPicker");
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Select local workspace" }).click();

  await expect(
    page.getByText(
      "This browser cannot select a production local workspace. Use an approved Chromium or Edge profile.",
    ),
  ).toBeVisible();
});

test("reports permission denial without claiming production readiness", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "showDirectoryPicker", {
      configurable: true,
      value: () =>
        Promise.reject(
          new DOMException("Permission denied", "NotAllowedError"),
        ),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Select local workspace" }).click();
  await expect(
    page.getByText(
      "Workspace selection was cancelled or could not be completed.",
    ),
  ).toBeVisible();
});

test("reopens a persisted local workspace after reload and blocks when access is revoked", async ({
  page,
}) => {
  await installPersistentWorkspace(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Select local workspace" }).click();
  await page.getByLabel("Reviewer identifier").fill("workspace-reviewer");
  await page.getByLabel("Reviewer display name").fill("Workspace Reviewer");
  await page.getByLabel("Case number").fill("PBGC-CAPABILITIES-001");
  await page.getByRole("button", { name: "Create production case" }).click();
  const firstCaseId = await page.getByTestId("current-case-id").textContent();

  await page.reload();
  await page.getByRole("button", { name: "Select local workspace" }).click();
  await page.getByLabel("Reviewer identifier").fill("workspace-reviewer");
  await page.getByLabel("Reviewer display name").fill("Workspace Reviewer");
  await page.getByLabel("Case number").fill("PBGC-CAPABILITIES-001");
  await page.getByRole("button", { name: "Create production case" }).click();

  await expect(
    page.getByRole("heading", { name: "Existing case found" }),
  ).toBeVisible();
  await expect(page.getByTestId("existing-case-id")).toHaveText(
    firstCaseId ?? "",
  );

  await page.evaluate((stateKey) => {
    const raw = localStorage.getItem(stateKey);
    const next = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    next.revoked = true;
    localStorage.setItem(stateKey, JSON.stringify(next));
  }, STATE_KEY);

  await page.getByRole("button", { name: "Select local workspace" }).click();
  await expect(
    page.getByText(
      "Workspace selection was cancelled or could not be completed.",
    ),
  ).toBeVisible();
});
