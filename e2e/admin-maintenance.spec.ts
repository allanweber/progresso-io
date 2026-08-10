import { expect, test } from "@playwright/test";

/**
 * Admin data-maintenance → Anamneses tab, against the real DB (see
 * scripts/e2e.mjs), on the seeded admin session. The seed gives one clinic
 * ("Clínica de Thiago") its 6 system starters (source_key set) and assigns the
 * hypertrophy one to Ana. Serial: the delete + re-import tests build on state.
 */

test.describe.configure({ mode: "serial" });

const REEDUCACAO = "Anamnese — Saúde e reeducação alimentar";
const HIPERTROFIA = "Anamnese — Hipertrofia / Ganho de massa";

// Pre-accept the cookie banner so it never overlays bottom-of-page controls.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("progresso-cookie-consent", "accepted"),
  );
});

test.describe("admin: anamnese maintenance", () => {
  test("lists anamneses by clinic tagged Sistema", async ({ page }) => {
    await page.goto("/admin/maintenance");
    await expect(
      page.getByRole("heading", { name: "Manutenção de dados" }),
    ).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(HIPERTROFIA) });
    await expect(row).toBeVisible();
    await expect(row.getByText("Sistema")).toBeVisible();
    await expect(row.getByText("Clínica de Thiago")).toBeVisible();
  });

  test("origin filter narrows to coach-authored (none seeded)", async ({ page }) => {
    await page.goto("/admin/maintenance");
    await page.locator("#mnt-origin").click();
    await page.getByRole("option", { name: "Clínica", exact: true }).click();
    // The empty state renders in both the desktop table + mobile cards (DOM),
    // so scope to the first (visible) match.
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
    await page.getByRole("option", { name: "Clínica de Thiago" }).click();
    // Wait for the starter list to load before selecting them all.
    await expect(dialog.getByText(HIPERTROFIA)).toBeVisible();
    await dialog.getByRole("button", { name: "Selecionar todas" }).click();
    await dialog.getByRole("button", { name: "Importar", exact: true }).click();

    await expect(dialog.getByText(/0 importada\(s\)/)).toBeVisible();
    await expect(dialog.getByText(/já existiam/)).toBeVisible();
  });

  test("hard-deletes an anamnese (usage 0) after confirm", async ({ page }) => {
    await page.goto("/admin/maintenance");
    await page
      .getByRole("button", { name: `Excluir ${REEDUCACAO}` })
      .click();

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
    await page.getByRole("option", { name: "Clínica de Thiago" }).click();
    // Wait for the starter list to load before selecting them all.
    await expect(dialog.getByText(HIPERTROFIA)).toBeVisible();
    await dialog.getByRole("button", { name: "Selecionar todas" }).click();
    await dialog.getByRole("button", { name: "Importar", exact: true }).click();

    // The deleted 'Reeducação' comes back; the other 5 are skipped.
    await expect(dialog.getByText(/1 importada\(s\)/)).toBeVisible();
    await expect(dialog.getByText(/5 já existiam/)).toBeVisible();
  });

  test("delete confirm shows student usage for an assigned anamnese", async ({
    page,
  }) => {
    await page.goto("/admin/maintenance");
    await page.getByRole("button", { name: `Excluir ${HIPERTROFIA}` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/atribuída a/)).toBeVisible();
    await expect(dialog.getByText(/1/)).toBeVisible();
  });
});
