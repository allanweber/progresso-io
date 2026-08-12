import { expect, test } from "@playwright/test";

/**
 * The public clinic portal (branded microsite + login), against the seeded demo
 * clinic — plan "clínica", slug "studio-forja", branding set (see src/db/seed.ts).
 * No auth: these are public pages.
 */

// Pre-accept the cookie banner so it never overlays controls.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("progresso-cookie-consent", "accepted"),
  );
});

test.describe("clinic portal microsite", () => {
  test("renders the branded microsite and links to the branded login", async ({
    page,
  }) => {
    await page.goto("/studio-forja");

    // Seeded branding is visible.
    await expect(
      page.getByText("Treinamento e nutrição personalizados"),
    ).toBeVisible();

    // The "Área do aluno" CTA leads to the branded login, which shows the form.
    const cta = page.getByRole("link", { name: "Área do aluno" });
    await expect(cta).toBeVisible();
    // The seeded accent color (#7c3aed) is applied to the CTA — proving the
    // clinic's "Cor de destaque" actually themes the public portal.
    await expect(cta).toHaveCSS("background-color", "rgb(124, 58, 237)");
    await cta.click();
    await expect(page).toHaveURL(/\/studio-forja\/entrar$/);
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
  });

  test("an unknown slug is a 404", async ({ page }) => {
    const res = await page.goto("/nao-existe-esse-slug");
    expect(res?.status()).toBe(404);
  });
});
