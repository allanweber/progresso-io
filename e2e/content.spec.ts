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
    // Turnstile is pinned off for the suite (see scripts/e2e.mjs): the widget
    // is a real Cloudflare challenge and headless Chromium does not solve one.
    // So this covers the unconfigured path — the verifier itself is tested in
    // `tests/turnstile.test.ts`.
    await page.goto("/contact");
    await page.getByLabel("Nome").fill("Maria Teste");
    await page.getByLabel("E-mail").fill("maria@example.com");
    await page.getByLabel("Mensagem").fill("Olá, gostaria de saber mais sobre os planos.");

    // The form drops anything submitted faster than a human could type it, so
    // a real visitor has to be simulated at human speed. Note what this test
    // can and cannot see: a tripped trap shows this same success screen, so
    // "delivered" vs "silently dropped" is asserted in `tests/contact.test.ts`,
    // which can watch whether the e-mail was actually sent.
    await page.waitForTimeout(2_500);
    await page.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(
      page.getByRole("heading", { name: "Mensagem enviada!" }),
    ).toBeVisible();

  });

  test("the honeypot swallows a bot submission", async ({ page }) => {
    await page.goto("/contact");
    await page.getByLabel("Nome").fill("Bot");
    await page.getByLabel("E-mail").fill("bot@example.com");
    await page.getByLabel("Mensagem").fill("Compre seguidores baratos agora mesmo!");

    // What a scraper does: post every named field it can find, including the
    // one that is off-screen and untabbable. Set through the DOM rather than
    // `fill()` on purpose — a zero-size element isn't fillable, and a bot
    // wouldn't be typing into it either.
    await page
      .locator("#website")
      .evaluate((el) => ((el as HTMLInputElement).value = "https://spam.example"));

    await page.waitForTimeout(2_500);
    await page.getByRole("button", { name: "Enviar mensagem" }).click();

    // It gets the same screen a human gets: told "recusado", a bot would just
    // retune and retry until it found the shape that works. That the message is
    // also *dropped* is asserted in `tests/contact.test.ts` — from here the two
    // outcomes are deliberately indistinguishable, which is the whole design.
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

  test("the Enterprise plan CTA reaches the contact form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Aceitar" }).click();

    // This was a `mailto:`, which does nothing at all for a visitor with no
    // mail client registered — an inert button on the one plan whose only way
    // in is talking to a human. Asserting the landing rather than just the
    // href, because "the click goes somewhere" is the part that broke.
    await page
      .getByRole("link", { name: "Entrar em contato" })
      .click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(
      page.getByRole("heading", { name: "Contato", level: 1 }),
    ).toBeVisible();
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
