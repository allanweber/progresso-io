import { expect, test } from "@playwright/test";

test.describe("auth routes", () => {
  test("redirects unauthenticated users away from the dashboard", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/);
    await expect(
      page.getByRole("heading", { name: "Bem-vindo de volta" }),
    ).toBeVisible();
  });

  test("login screen renders with Google and links to register/forgot", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Bem-vindo de volta" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Entrar com Google/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Criar conta grátis/i })).toHaveAttribute(
      "href",
      "/register",
    );
    await expect(page.getByRole("link", { name: "Esqueci a senha" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  test("shows the Google OAuth error banner", async ({ page }) => {
    await page.goto("/login?error=google");
    await expect(
      page.getByText(/Não foi possível entrar com o Google/i),
    ).toBeVisible();
  });

  test("forgot-password screen renders", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(
      page.getByRole("heading", { name: "Esqueceu a senha?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enviar código" }),
    ).toBeVisible();
  });
});

test.describe("sign-up wizard", () => {
  test("validates step 1 and advances through the steps", async ({ page }) => {
    await page.goto("/register");
    await expect(
      page.getByRole("heading", { name: "Crie sua conta" }),
    ).toBeVisible();

    // Empty submit surfaces a validation message.
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText(/Preencha nome, e-mail/i)).toBeVisible();

    // Fill valid details and continue to the plan step.
    await page.getByLabel("Nome completo").fill("Thiago Corrêa");
    await page.getByLabel("E-mail profissional").fill("coach@example.com");
    await page.getByLabel("Senha").fill("supersegura123");
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(
      page.getByRole("heading", { name: "Escolha seu plano" }),
    ).toBeVisible();

    // Pick a plan and reach the confirmation step.
    await page.getByRole("button", { name: /Clínica/ }).click();
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(
      page.getByRole("heading", { name: "Tudo pronto para começar" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Criar conta/ }),
    ).toBeVisible();
  });
});

test.describe("OTP entry", () => {
  test("verify-account shows the email and enables submit at 6 digits", async ({
    page,
  }) => {
    await page.goto("/verify-account?email=teste%40example.com");
    await expect(page.getByText("teste@example.com")).toBeVisible();

    const boxes = page.getByLabel(/Dígito/);
    await expect(boxes).toHaveCount(6);

    const submit = page.getByRole("button", { name: "Confirmar conta" });
    await expect(submit).toBeDisabled();

    // Typing into the first box auto-advances through all six.
    await boxes.first().click();
    await page.keyboard.type("123456");
    await expect(boxes.nth(5)).toHaveValue("6");
    await expect(submit).toBeEnabled();
  });

  test("reset-password shows the code and password fields", async ({ page }) => {
    await page.goto("/reset-password?email=teste%40example.com");
    await expect(
      page.getByRole("heading", { name: "Redefinir senha" }),
    ).toBeVisible();
    await expect(page.getByLabel(/Dígito/)).toHaveCount(6);
    await expect(page.getByLabel("Nova senha", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("Confirmar nova senha", { exact: true }),
    ).toBeVisible();
  });
});
