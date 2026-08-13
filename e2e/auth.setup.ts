import { expect, test as setup } from "@playwright/test";

/**
 * Logs the seeded coach in through the real login UI and saves the session, so
 * the `coach` project starts already authenticated. Credentials come from the
 * seed (see scripts/e2e.mjs → db/seed.ts).
 */
const COACH_STORAGE = "e2e/.auth/coach.json";
const ALUNO_STORAGE = "e2e/.auth/aluno.json";
const ADMIN_STORAGE = "e2e/.auth/admin.json";

// The dev server compiles /login, the sign-in action and the target dashboard
// subtree on first hit; in a cold/constrained sandbox that chain can outrun the
// default 60s test timeout, so give each login room.
setup.setTimeout(120_000);

setup("authenticate as coach", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("coach@progresso.io");
  await page.getByLabel("Senha").fill("progresso123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  // Generous timeout: the dev server compiles the /coach subtree on first hit
  // (Turbopack), which can outrun the default 60s in a cold/constrained sandbox.
  await page.waitForURL("**/coach", { timeout: 120_000 });
  await expect(page).toHaveURL(/\/coach$/);

  await page.context().storageState({ path: COACH_STORAGE });
});

setup("authenticate as aluno", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("aluno@progresso.io");
  await page.getByLabel("Senha").fill("progresso123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  await page.waitForURL("**/student", { timeout: 120_000 });
  await expect(page).toHaveURL(/\/student$/);

  await page.context().storageState({ path: ALUNO_STORAGE });
});

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("admin@progresso.io");
  await page.getByLabel("Senha").fill("progresso123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  await page.waitForURL("**/admin", { timeout: 120_000 });
  await expect(page).toHaveURL(/\/admin$/);

  await page.context().storageState({ path: ADMIN_STORAGE });
});
