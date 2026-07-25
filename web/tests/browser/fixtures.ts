import { mkdir } from "node:fs/promises";

import { test as base, type Page } from "@playwright/test";

interface BrowserFixtures {
  localWorkspacePath: string;
  offlinePage: Page;
  outboundRequests: string[];
}

export const test = base.extend<BrowserFixtures>({
  localWorkspacePath: async ({ browserName }, use, testInfo) => {
    void browserName;
    const workspacePath = testInfo.outputPath("synthetic-local-workspace");
    await mkdir(workspacePath, { recursive: true });
    await use(workspacePath);
  },
  outboundRequests: async ({ browserName }, use) => {
    void browserName;
    await use([]);
  },
  offlinePage: async ({ page, outboundRequests }, use) => {
    page.on("request", (request) => {
      const url = request.url();
      if (
        !url.startsWith("http://127.0.0.1:4173/") &&
        !url.startsWith("file:") &&
        !url.startsWith("blob:")
      ) {
        outboundRequests.push(url);
      }
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";
