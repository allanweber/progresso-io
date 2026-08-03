import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

// Use the pre-installed Chromium in this environment when present (its build
// may differ from the one @playwright/test would download); otherwise fall
// back to Playwright's managed browser.
const SYSTEM_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = existsSync(SYSTEM_CHROMIUM) ? SYSTEM_CHROMIUM : undefined;

/**
 * E2E tests exercise the auth UI (route guard, screen rendering, the sign-up
 * wizard and the OTP input) against a running dev server. They intentionally
 * avoid submitting real credentials so the suite needs no database.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
