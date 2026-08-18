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
  // Heavy file processing (PDF parsing, multi-megabyte archive expansion) can
  // exceed the defaults when several workers contend for CPU, even though
  // each test passes comfortably in isolation.
  timeout: 60_000,
  expect: {
    // The default per-locator polling timeout (5s) is too tight for the
    // "File inventory complete" banner after a PDF or large archive upload
    // under parallel load; give all assertions consistent headroom.
    timeout: 15_000,
  },
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
