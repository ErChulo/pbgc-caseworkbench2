import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./web/tests/browser",
  outputDir: "./test-results/playwright",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath:
            process.env.PW_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium",
        },
      },
    },
    {
      name: "edge",
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
  ],
});
