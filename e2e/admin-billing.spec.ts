import { expect, test, type Page } from "@playwright/test";

/**
 * Manual billing on the per-clinic admin detail page (`/admin/clinics/[id]`),
 * against the real DB on the seeded admin session.
 *
 * Scoped to the ISOLATED "Clínica Admin E2E" clinic (never the demo coach's
 * clinic the coach/student specs read), so changing its plan and adding invoices
 * here can't race other specs. Serial: the plan change + invoice lifecycle build
 * on state. Captures desktop + mobile screenshots as a byproduct.
 */

test.describe.configure({ mode: "serial" });

const CLINIC = "Clínica Admin E2E";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("progresso-cookie-consent", "accepted"),
  );
});

/** Opens the Clínicas tab and follows the clinic link to its detail page. */
async function openClinicDetail(page: Page) {
  await page.goto("/admin/maintenance");
  await page.getByRole("tab", { name: "Clínicas" }).click();
  await page.getByRole("link", { name: CLINIC }).first().click();
  await expect(page.getByRole("heading", { name: CLINIC })).toBeVisible();
}

test.describe("admin: manual billing", () => {
  test("changes the clinic plan and logs the change in the history", async ({
    page,
  }) => {
    await openClinicDetail(page);

    // Change the plan to Solo and save.
    await page.locator("#plan-select").click();
    await page.getByRole("option", { name: "Solo" }).click();
    await page.getByRole("button", { name: "Salvar plano" }).click();

    // The change is logged (from Clínica → Solo).
    await expect(page.getByText("Histórico de alterações")).toBeVisible();
    await expect(page.getByText(/Clínica → Solo/)).toBeVisible();
  });

  test("creates an invoice and marks it paid", async ({ page }) => {
    // --- Desktop ---
    await page.setViewportSize({ width: 1280, height: 900 });
    await openClinicDetail(page);

    await page.getByRole("button", { name: "Nova fatura" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Nova fatura")).toBeVisible();

    await dialog.getByLabel("Descrição do item 1").fill("Mensalidade E2E");
    await dialog.getByLabel("Valor do item 1").fill("199.00");
    // Live total reflects the single line item.
    await expect(dialog.getByText("R$ 199,00").first()).toBeVisible();
    await dialog.getByRole("button", { name: "Criar fatura" }).click();

    // The invoice lands in the table as pending, with its total.
    const row = page.getByRole("row", { name: /R\$ 199,00/ }).first();
    await expect(row).toBeVisible();

    await page.screenshot({
      path: "test-results/admin-billing-desktop.png",
      fullPage: true,
    });

    // Mark it paid.
    await row.getByRole("button", { name: "Marcar paga" }).click();
    const payDialog = page.getByRole("dialog");
    await expect(payDialog.getByText(/Marcar fatura/)).toBeVisible();
    await payDialog.getByRole("button", { name: "Confirmar pagamento" }).click();

    // Its status flips to Paga.
    await expect(page.getByText("Paga").first()).toBeVisible();

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await openClinicDetail(page);
    await expect(page.getByRole("heading", { name: "Faturas" })).toBeVisible();
    await page.screenshot({
      path: "test-results/admin-billing-mobile.png",
      fullPage: true,
    });
  });
});
