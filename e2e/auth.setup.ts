import { expect, test as setup } from "@playwright/test";

/**
 * Logs the seeded coach in through the real login UI and saves the session, so
 * the `coach` project starts already authenticated. Credentials come from the
 * seed (see scripts/e2e.mjs → db/seed.ts).
 */
const COACH_STORAGE = "e2e/.auth/coach.json";

setup("authenticate as coach", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("coach@progresso.io");
  await page.getByLabel("Senha").fill("progresso123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  await page.waitForURL("**/coach");
  await expect(page).toHaveURL(/\/coach$/);

  await page.context().storageState({ path: COACH_STORAGE });
});
