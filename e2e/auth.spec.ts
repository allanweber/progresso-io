import { expect, test } from "@playwright/test";

test.describe("auth routes", () => {
  test("redirects unauthenticated users away from every role area", async ({
    page,
  }) => {
    for (const [path, encoded] of [
      ["/coach", "%2Fcoach"],
      ["/student", "%2Fstudent"],
      ["/admin", "%2Fadmin"],
      ["/dashboard", "%2Fdashboard"],
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?redirect=${encoded}`));
    }
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

/**
 * "Continuar conectado" — the box is what stands between a coach and typing
 * their password every week, so what's asserted here is the *cookie*, not the
 * checkbox: ticked, the session outlives the browser; unticked, it dies with
 * it. Signs in as the seeded coach, the same account auth.setup.ts uses.
 */
test.describe("continuar conectado", () => {
  /** The Better Auth session cookie, whatever prefix the origin gives it. */
  async function sessionCookie(context: import("@playwright/test").BrowserContext) {
    const cookies = await context.cookies();
    return cookies.find((c) => c.name.includes("session_token"));
  }

  async function signIn(page: import("@playwright/test").Page, remember: boolean) {
    await page.goto("/login");
    const box = page.getByRole("checkbox", { name: "Continuar conectado" });
    // Checked by default: staying signed in is the normal case.
    await expect(box).toBeChecked();
    if (!remember) await box.uncheck();

    await page.getByLabel("E-mail").fill("coach@progresso.io");
    await page.getByLabel("Senha").fill("progresso123");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL("**/coach");
  }

  test("keeps the session for months when checked", async ({ page, context }) => {
    await signIn(page, true);

    const cookie = await sessionCookie(context);
    // Playwright reports a browser-session cookie as expires === -1, so a real
    // expiry is itself the assertion — plus it has to be months out, not days.
    expect(cookie?.expires).toBeGreaterThan(0);
    const daysLeft = (cookie!.expires * 1000 - Date.now()) / 86_400_000;
    expect(daysLeft).toBeGreaterThan(80);
  });

  test("ends the session with the browser when unchecked", async ({
    page,
    context,
  }) => {
    await signIn(page, false);

    // Signed in for now…
    await expect(page).toHaveURL(/\/coach$/);
    // …but on a cookie the browser throws away when it closes.
    const cookie = await sessionCookie(context);
    expect(cookie?.expires).toBe(-1);
  });
});
