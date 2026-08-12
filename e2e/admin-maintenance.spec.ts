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

test.describe("admin: diet & workout maintenance", () => {
  test("Dietas tab lists a clinic's diets tagged Sistema", async ({ page }) => {
    await page.goto("/admin/maintenance");
    await page.getByRole("tab", { name: "Dietas" }).click();
    await page.locator("#mnt-diets-clinic").click();
    await page.getByRole("option", { name: CLINIC }).click();

    const row = page.getByRole("row", {
      name: new RegExp("Hipertrofia — Ganho de Massa"),
    });
    await expect(row).toBeVisible();
    await expect(row.getByText("Sistema")).toBeVisible();
    await expect(row.getByText(CLINIC)).toBeVisible();
  });

  test("Treinos tab lists a clinic's workouts tagged Sistema", async ({
    page,
  }) => {
    await page.goto("/admin/maintenance");
    await page.getByRole("tab", { name: "Treinos" }).click();
    await page.locator("#mnt-workouts-clinic").click();
    await page.getByRole("option", { name: CLINIC }).click();

    const row = page.getByRole("row", { name: new RegExp("Bro Split 5x") });
    await expect(row).toBeVisible();
    await expect(row.getByText("Sistema")).toBeVisible();
  });

  test("importing all diet starters into the seeded clinic is idempotent", async ({
    page,
  }) => {
    await page.goto("/admin/maintenance");
    await page.getByRole("tab", { name: "Dietas" }).click();
    await page.getByRole("button", { name: "Importar starters" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#import-diets-clinic").click();
    await page.getByRole("option", { name: CLINIC }).click();
    await dialog.getByRole("button", { name: "Selecionar todos" }).click();
    await dialog.getByRole("button", { name: "Importar", exact: true }).click();

    // The seeded clinic already has every diet starter → nothing new imported.
    await expect(dialog.getByText(/0 importado\(s\)/)).toBeVisible();
    await expect(dialog.getByText(/já existiam/)).toBeVisible();
  });
});

test.describe("admin: clinic maintenance", () => {
  // Non-destructive: only exercises the type-to-confirm gate, then cancels — the
  // isolated clinic the other tests rely on must survive.
  test("Clínicas tab lists clinics and gates delete behind type-to-confirm", async ({
    page,
  }) => {
    await page.goto("/admin/maintenance");
    await page.getByRole("tab", { name: "Clínicas" }).click();

    const row = page.getByRole("row", { name: new RegExp(CLINIC) });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: `Excluir ${CLINIC}` }).click();
    const dialog = page.getByRole("dialog");
    const confirmBtn = dialog.getByRole("button", { name: "Excluir clínica" });

    // Disabled until the exact clinic name is typed.
    await expect(confirmBtn).toBeDisabled();
    await dialog.getByLabel(/para confirmar/).fill("errado");
    await expect(confirmBtn).toBeDisabled();
    await dialog.getByLabel(/para confirmar/).fill(CLINIC);
    await expect(confirmBtn).toBeEnabled();

    // Cancel — do NOT delete the shared isolated clinic.
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
  });
});
