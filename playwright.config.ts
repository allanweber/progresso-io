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
 * (`pnpm test:e2e`), which boots + migrates + seeds the DB, builds the app
 * and serves it with `ENABLE_TEST_OUTBOX=true` so the invite→accept loop is
 * drivable. Running `playwright test` directly (no DB) only fits the `public`
 * project, and still needs a standalone build present.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // The suite runs against a PRODUCTION build, not `next dev`.
  // Turbopack's on-demand dev compile dominated the wall clock — every first
  // navigation to a route paid for compiling it, and specs raced that compile
  // hard enough to need route pre-warming and a 60s timeout. A prebuilt server
  // serves every route immediately, so neither is needed.
  timeout: 30_000,
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
      name: "ai",
      testMatch: /ai-generator\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        launchOptions,
        storageState: COACH_STORAGE,
      },
    },
    {
      // The portfolio tour. Each describe sets its own storageState — the tour
      // crosses all three roles, which one project-level session cannot.
      name: "portfolio",
      testMatch: /portfolio\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], launchOptions },
    },
    {
      name: "admin",
      testMatch: /admin-(maintenance|admins|billing|whatsapp|ai)\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        launchOptions,
        storageState: ADMIN_STORAGE,
      },
    },
  ],
  webServer: {
    // The standalone server built by `scripts/e2e.mjs` — the same artifact that
    // gets deployed. It takes its port from the environment, not a flag.
    command: "node .next/standalone/server.js",
    env: { PORT: String(PORT) },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
