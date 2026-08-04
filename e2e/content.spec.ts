import { expect, test } from "@playwright/test";

test.describe("content pages", () => {
  test("renders Termos de Uso, Privacidade and Contato", async ({ page }) => {
    await page.goto("/terms");
    await expect(
      page.getByRole("heading", { name: "Termos de Uso", level: 1 }),
    ).toBeVisible();

    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: "Privacidade", level: 1 }),
    ).toBeVisible();

    await page.goto("/contact");
    await expect(
      page.getByRole("heading", { name: "Contato", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "contato@progresso.io" }),
    ).toBeVisible();
  });

  test("landing footer links navigate to the content pages", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");

    await footer.getByRole("link", { name: "Termos de Uso" }).click();
    await expect(page).toHaveURL(/\/terms$/);

    await page.goto("/");
    await footer.getByRole("link", { name: "Privacidade" }).click();
    await expect(page).toHaveURL(/\/privacy$/);

    await page.goto("/");
    await footer.getByRole("link", { name: "Contato" }).click();
    await expect(page).toHaveURL(/\/contact$/);
  });
});
