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
    // The contact form replaces any exposed address.
    await expect(page.getByLabel("Mensagem")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enviar mensagem" }),
    ).toBeVisible();
    await expect(page.getByText("@gmail.com")).toHaveCount(0);
  });

  test("contact form submits", async ({ page }) => {
    await page.goto("/contact");
    await page.getByLabel("Nome").fill("Maria Teste");
    await page.getByLabel("E-mail").fill("maria@example.com");
    await page.getByLabel("Mensagem").fill("Olá, gostaria de saber mais sobre os planos.");
    await page.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(
      page.getByRole("heading", { name: "Mensagem enviada!" }),
    ).toBeVisible();
  });

  test("landing footer links navigate to the content pages", async ({ page }) => {
    await page.goto("/");
    // Dismiss the cookie banner so it doesn't overlap the footer.
    await page.getByRole("button", { name: "Aceitar" }).click();
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

test.describe("cookie consent", () => {
  test("shows once and stays dismissed after accepting", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("dialog", { name: "Aviso de cookies" });
    await expect(banner).toBeVisible();

    await page.getByRole("button", { name: "Aceitar" }).click();
    await expect(banner).toBeHidden();

    // Still dismissed after a reload (persisted in localStorage).
    await page.reload();
    await expect(banner).toBeHidden();
  });
});
