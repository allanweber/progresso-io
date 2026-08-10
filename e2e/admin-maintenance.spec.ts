import { expect, test, type Page } from "@playwright/test";

/**
 * Admin data-maintenance → Anamneses tab, against the real DB (see
 * scripts/e2e.mjs), on the seeded admin session.
 *
 * The seed provides an ISOLATED clinic — "Clínica Admin E2E" — with its 6 system
 * starters and no students. Every test scopes to it (clinic filter), so the
 * destructive delete/import here never races with the coach/student specs that
 * read the demo coach's clinic. Serial: delete + re-import build on state.
 */

test.describe.configure({ mode: "serial" });

const CLINIC = "Clínica Admin E2E";
const REEDUCACAO = "Anamnese — Saúde e reeducação alimentar";
const HIPERTROFIA = "Anamnese — Hipertrofia / Ganho de massa";

// Pre-accept the cookie banner so it never overlays bottom-of-page controls.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("progresso-cookie-consent", "accepted"),
  );
});

/** Opens the page and scopes the list to the isolated clinic. */
async function openScoped(page: Page) {
  await page.goto("/admin/maintenance");
  await page.locator("#mnt-clinic").click();
  await page.getByRole("option", { name: CLINIC }).click();
}

test.describe("admin: anamnese maintenance", () => {
  test("lists a clinic's anamneses tagged Sistema", async ({ page }) => {
    await openScoped(page);
    const row = page.getByRole("row", { name: new RegExp(HIPERTROFIA) });
    await expect(row).toBeVisible();
    await expect(row.getByText("Sistema")).toBeVisible();
    await expect(row.getByText(CLINIC)).toBeVisible();
  });

  test("origin filter → Clínica shows none (no coach-authored here)", async ({
    page,
  }) => {
    await openScoped(page);
    await page.locator("#mnt-origin").click();
    await page.getByRole("option", { name: "Clínica", exact: true }).click();
    await expect(
      page.getByText("Nenhuma anamnese encontrada.").first(),
    ).toBeVisible();
  });

  test("import is idempotent — all starters already present are skipped", async ({
    page,
  }) => {
    await page.goto("/admin/maintenance");
    await page.getByRole("button", { name: "Importar starters" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#import-clinic").click();
    await page.getByRole("option", { name: CLINIC }).click();
    await expect(dialog.getByText(HIPERTROFIA)).toBeVisible();
    await dialog.getByRole("button", { name: "Selecionar todas" }).click();
    await dialog.getByRole("button", { name: "Importar", exact: true }).click();

    await expect(dialog.getByText(/0 importada\(s\)/)).toBeVisible();
    await expect(dialog.getByText(/já existiam/)).toBeVisible();
  });

  test("hard-deletes an anamnese (usage 0) after confirm", async ({ page }) => {
    await openScoped(page);
    await page.getByRole("button", { name: `Excluir ${REEDUCACAO}` }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Nenhum aluno foi atribuído/)).toBeVisible();
    await dialog.getByRole("button", { name: "Excluir", exact: true }).click();

    await expect(page.getByText(REEDUCACAO)).toHaveCount(0);
  });

  test("re-imports only the missing starter", async ({ page }) => {
    await page.goto("/admin/maintenance");
    await page.getByRole("button", { name: "Importar starters" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#import-clinic").click();
    await page.getByRole("option", { name: CLINIC }).click();
    await expect(dialog.getByText(HIPERTROFIA)).toBeVisible();
    await dialog.getByRole("button", { name: "Selecionar todas" }).click();
    await dialog.getByRole("button", { name: "Importar", exact: true }).click();

    await expect(dialog.getByText(/1 importada\(s\)/)).toBeVisible();
    await expect(dialog.getByText(/5 já existiam/)).toBeVisible();
  });
});
