/* eslint-disable @typescript-eslint/require-await */
import type { Page } from "@playwright/test";

export async function installSyntheticWorkspace(page: Page) {
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
          if (!options?.create && !directories.has(path))
            throw new DOMException("Not found", "NotFoundError");
          return makeDirectory(path);
        },
        getFileHandle: async (
          name: string,
          options?: FileSystemGetFileOptions,
        ) => {
          const path = prefix ? `${prefix}/${name}` : name;
          if (!options?.create && !files.has(path))
            throw new DOMException("Not found", "NotFoundError");
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
                type: "application/octet-stream",
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
                if (data instanceof Uint8Array)
                  files.set(path, Uint8Array.from(data));
                else if (data instanceof ArrayBuffer)
                  files.set(path, new Uint8Array(data));
                else throw new Error("Unsupported synthetic write type.");
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
