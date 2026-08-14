import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

// Use the pre-installed Chromium in this environment when present (its build
// may differ from the one @playwright/test would download); otherwise fall
// back to Playwright's managed browser.
const SYSTEM_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = existsSync(SYSTEM_CHROMIUM) ? SYSTEM_CHROMIUM : undefined;
const launchOptions = { executablePath };

/** Saved sessions, produced by the setup project, reused by the auth'd projects. */
const COACH_STORAGE = "e2e/.auth/coach.json";
const ALUNO_STORAGE = "e2e/.auth/aluno.json";
const ADMIN_STORAGE = "e2e/.auth/admin.json";

/**
 * E2E is split in three projects:
 * - `public`  — auth UI + marketing pages, unauthenticated (no DB writes).
 * - `setup`   — logs the seeded coach in once and saves the session.
 * - `coach`   — authenticated student-management flows, reusing that session.
 *
 * The suite runs against a REAL Postgres via `node scripts/e2e.mjs`
 * (`npm run test:e2e`), which boots + migrates + seeds the DB and starts the
 * dev server with `ENABLE_TEST_OUTBOX=true` so the invite→accept loop is
 * drivable. Running `playwright test` directly (no DB) only fits the `public`
 * project.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // The suite runs against `next dev`. globalSetup pre-compiles routes so tests
  // don't race a cold Turbopack compile; the raised timeout covers the invite
  // flow's several navigations, and one retry absorbs any residual cold-start
  // abort.
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: 1,
  reporter: process.env.CI ? "list" : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "public",
      testMatch: /(auth|content|portal)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], launchOptions },
    },
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], launchOptions },
    },
    {
      name: "coach",
      testMatch: /\/(students|dashboard|settings|feedback|calendar|whatsapp)\.spec\.ts$/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        launchOptions,
        storageState: COACH_STORAGE,
      },
    },
    {
      name: "student",
      testMatch: /student\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        launchOptions,
        storageState: ALUNO_STORAGE,
      },
    },
    {
      name: "diets",
      testMatch: /diets\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        launchOptions,
        storageState: COACH_STORAGE,
      },
    },
    {
      name: "workouts",
      testMatch: /workouts\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        launchOptions,
        storageState: COACH_STORAGE,
      },
    },
    {
      name: "anamneses",
      testMatch: /anamneses\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        launchOptions,
        storageState: COACH_STORAGE,
      },
    },
    {
      name: "student-intake",
      testMatch: /student-intake\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        launchOptions,
        storageState: COACH_STORAGE,
      },
    },
    {
      name: "admin",
      testMatch: /admin-(maintenance|admins|billing|whatsapp)\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        launchOptions,
        storageState: ADMIN_STORAGE,
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
