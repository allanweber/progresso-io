import { expect, test } from "@playwright/test";

import { waitForMessage } from "./outbox";

/**
 * The setup guide — the flow a coach meets immediately after sign-up.
 *
 * The first run is driven against a **real, brand-new account**: the spec
 * registers through /register, confirms the OTP from the test outbox, and is
 * redirected into the guide by the coach layout. Nothing is faked, because the
 * thing under test is precisely "after the coach signs up, the guide starts" —
 * a seeded fixture that begins mid-flow could pass while that link is broken.
 *
 * The re-run is a separate test against the seeded coach (whose clinic is
 * already onboarded), reached the way a coach reaches it: from Configurações.
 *
 * Screenshots are a byproduct of these assertions, at both viewports.
 */

const password = "supersegura123";

/** The seeded coach's saved session, used only by the re-run describe. */
const COACH_STORAGE = "e2e/.auth/coach.json";

/** A fresh address per run, so the outbox filter can't collide with a sibling. */
function newEmail(tag: string): string {
  return `guia-${tag}-${Date.now().toString(36)}@example.com`;
}

// The first run signs up its own coach, so it must start signed out — the
// project has no session, and this makes that explicit next to the tests.
test.describe("setup guide · first run", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("starts right after sign-up, imports the ticked models and finishes", async ({
    page,
    request,
  }) => {
    const email = newEmail("solo");

    // --- Sign up for real: account → plan → confirm. ---
    await page.goto("/register");
    await page.getByLabel("Nome completo").fill("Coach do Guia");
    await page.getByLabel("E-mail profissional").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(
      page.getByRole("heading", { name: "Escolha seu plano" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Solo/ }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: /Criar conta/ }).click();

    // --- Confirm the e-mailed OTP. ---
    await expect(page).toHaveURL(/\/verify-account/);
    const otp = await waitForMessage(request, email, "otp");
    expect(otp.code).toMatch(/^\d{6}$/);
    await page.getByLabel(/Dígito/).first().click();
    await page.keyboard.type(otp.code!);
    await page.getByRole("button", { name: "Confirmar conta" }).click();

    // Verification lands on the login screen; sign in as the new coach.
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel(/E-mail/).fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: /Entrar/ }).click();

    // --- The guide starts on its own — no link was clicked to get here. ---
    await expect(page).toHaveURL(/\/onboarding/);

    // Step 1 of three starter steps: one domain per screen, five at a time, all
    // pre-ticked. The counter always speaks for the whole domain, not the page.
    await expect(
      page.getByRole("heading", { name: "Escolha suas dietas" }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(5);
    await expect(page.getByText("5 de 13 mostradas · 13 selecionados")).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({
      path: "test-results/screens/onboarding-dietas-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/screens/onboarding-dietas-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });

    // The select-all control really toggles, in both directions, and it means the
    // whole domain even while only five rows are on screen.
    await page.getByRole("button", { name: "Limpar seleção" }).click();
    await expect(page.getByText("5 de 13 mostradas · 0 selecionados")).toBeVisible();
    await page.getByRole("button", { name: "Selecionar todos" }).click();
    await expect(page.getByText("5 de 13 mostradas · 13 selecionados")).toBeVisible();

    // Reveal the rest, five then three.
    await page.getByRole("button", { name: "Ver mais 5" }).click();
    await expect(page.getByRole("checkbox")).toHaveCount(10);
    await page.getByRole("button", { name: "Ver mais 3" }).click();
    await expect(page.getByRole("checkbox")).toHaveCount(13);
    await expect(page.getByRole("button", { name: /Ver mais/ })).toHaveCount(0);
    await expect(page.getByText("13 selecionados")).toBeVisible();

    // Untick one diet — the whole point of the step is that it is a choice.
    const vegana = page
      .getByRole("checkbox")
      .filter({ hasText: "Vegana" })
      .first();
    await vegana.click();
    await expect(vegana).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText("12 selecionados")).toBeVisible();

    await page.getByRole("button", { name: "Continuar" }).click();

    // Step 2: treinos.
    await expect(
      page.getByRole("heading", { name: "Escolha seus treinos" }),
    ).toBeVisible();
    // The reveal resets per domain — a fresh screen of five, not 13 rows deep.
    await expect(page.getByRole("checkbox")).toHaveCount(5);
    await expect(page.getByText("5 de 11 mostradas · 11 selecionados")).toBeVisible();
    await page.getByRole("button", { name: "Continuar" }).click();

    // Step 3: anamneses.
    await expect(
      page.getByRole("heading", { name: "Escolha suas anamneses" }),
    ).toBeVisible();
    await expect(page.getByText("5 de 6 mostradas · 6 selecionados")).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/onboarding-anamneses-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Continuar" }).click();

    // --- Feedback: the clinic-wide check-in default. ---
    await expect(
      page.getByRole("heading", { name: "Como você acompanha seus alunos" }),
    ).toBeVisible();
    await page.getByRole("radio", { name: /Quinzenal/ }).click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Quarta-feira" }).click();

    await page.screenshot({
      path: "test-results/screens/onboarding-feedback-desktop.png",
      fullPage: true,
    });

    await page.getByRole("button", { name: "Continuar" }).click();

    // --- Done. A Solo clinic gets three steps and the Clínica line. ---
    await expect(page.getByRole("heading", { name: "Tudo pronto" })).toBeVisible();
    await expect(page.getByText(/29 modelos importados/)).toBeVisible();
    await expect(page.getByText(/check-in quinzenal · quarta-feira/)).toBeVisible();
    await expect(page.getByText(/plano Clínica/)).toBeVisible();
    // No Equipe or Portal step for a Solo pick.
    await expect(page.getByText("Equipe")).toHaveCount(0);

    await page.screenshot({
      path: "test-results/screens/onboarding-pronto-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/screens/onboarding-pronto-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.getByRole("button", { name: "Ir para o painel" }).click();

    // --- The picks actually landed, and the guide never returns. ---
    await expect(page).toHaveURL(/\/coach$/);
    await page.goto("/coach/diets");
    await expect(page.getByText("Carregando dietas…")).toBeHidden();
    await expect(page.getByText("Emagrecimento").first()).toBeVisible();
    // The unticked one was not imported.
    await expect(page.getByText("Vegana")).toHaveCount(0);

    // A reload of any coach page stays put — the guide is stamped as done.
    await page.goto("/coach/students");
    await expect(page).toHaveURL(/\/coach\/students/);
  });

  test("skipping leaves with the full library and never asks again", async ({
    page,
    request,
  }) => {
    const email = newEmail("skip");

    await page.goto("/register");
    await page.getByLabel("Nome completo").fill("Coach Apressado");
    await page.getByLabel("E-mail profissional").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: /Criar conta/ }).click();

    const otp = await waitForMessage(request, email, "otp");
    await page.getByLabel(/Dígito/).first().click();
    await page.keyboard.type(otp.code!);
    await page.getByRole("button", { name: "Confirmar conta" }).click();

    await page.getByLabel(/E-mail/).fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: /Entrar/ }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByRole("button", { name: "Pular e ir para o painel" }).click();

    // Skipping is an exit, not an opt-out of having a library: the coach lands
    // on the dashboard with every starter imported, which is what the old
    // automatic seed did for everyone.
    await expect(page).toHaveURL(/\/coach$/);
    await page.goto("/coach/diets");
    await expect(page.getByText("Carregando dietas…")).toBeHidden();
    await expect(page.getByText("Vegana").first()).toBeVisible();

    // And it is never shown again.
    await page.goto("/coach");
    await expect(page).toHaveURL(/\/coach$/);
  });
});

test.describe("setup guide · re-run", () => {
  // The seeded coach's clinic is already onboarded, which is exactly the state a
  // re-run starts from.
  test.use({ storageState: COACH_STORAGE });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("progresso-cookie-consent", "accepted"),
    );
  });

  test("is reachable from Configurações and confirms before overwriting", async ({
    page,
  }) => {
    await page.goto("/coach/settings");
    await expect(
      page.getByRole("heading", { name: "Guia de configuração" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Refazer guia" }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await expect(
      page.getByRole("heading", { name: "Escolha suas dietas" }),
    ).toBeVisible();

    // Everything this clinic already holds is ticked and cannot be unticked —
    // the guide adds templates, it never removes them.
    const imported = page
      .getByRole("checkbox")
      .filter({ hasText: "já na sua biblioteca" })
      .first();
    await expect(imported).toHaveAttribute("aria-checked", "true");
    await expect(imported).toHaveAttribute("aria-disabled", "true");
    await imported.click();
    await expect(imported).toHaveAttribute("aria-checked", "true");

    // The seeded clinic holds every starter, so there is nothing left to toggle:
    // the select-all control is replaced by a line saying so, rather than sitting
    // there offering a "Limpar seleção" that cannot clear anything.
    await expect(
      page.getByRole("button", { name: /Limpar seleção|Selecionar todos/ }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Todas as dietas prontas já estão na sua biblioteca."),
    ).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({
      path: "test-results/screens/onboarding-rerun-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/screens/onboarding-rerun-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });

    // Through the three starter steps (all already imported, so nothing changes).
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(
      page.getByRole("heading", { name: "Escolha seus treinos" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(
      page.getByRole("heading", { name: "Escolha suas anamneses" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continuar" }).click();

    // Change a setting the clinic already has → the overwrite is confirmed
    // field by field before anything is saved.
    await expect(
      page.getByRole("heading", { name: "Como você acompanha seus alunos" }),
    ).toBeVisible();
    await page.getByRole("radio", { name: /Mensal/ }).click();
    await page.getByRole("button", { name: "Continuar" }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Confirmar alterações" }),
    ).toBeVisible();
    await expect(dialog.getByText(/Frequência de check-in/)).toBeVisible();
    await expect(dialog.getByText(/Mensal/)).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/onboarding-rerun-confirm-desktop.png",
      fullPage: true,
    });

    // Cancelling changes nothing.
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Como você acompanha seus alunos" }),
    ).toBeVisible();
  });
});
