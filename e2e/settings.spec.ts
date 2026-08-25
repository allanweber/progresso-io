import { expect, test } from "@playwright/test";

/**
 * Clinic configuration ("Configurações"). Runs in the `coach` project against
 * the seeded coach's session + the real DB. Asserts the two real, editable
 * sections (Clínica + Preferências de feedback) and the coming-soon ones, drives
 * a full save, and captures the desktop + mobile screenshots as a byproduct
 * (see the screenshots rule in AGENTS.md).
 */

// Pre-accept the cookie banner: below lg it sits on top of the sticky save bar,
// both in the way of a click and in the mobile screenshot.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("progresso-cookie-consent", "accepted"),
  );
});

// Serial: both tests share the seeded coach's clinic + DB, and the team test
// mutates coach invites — running them in order on one worker avoids races.
test.describe.configure({ mode: "serial" });

test.describe("clinic settings", () => {
  test("edits the real sections, saves, and shows coming-soon for the rest", async ({
    page,
  }) => {
    // A unique subdomain per run so re-saving never collides on the unique index.
    const subdomain = `studio-${Date.now().toString().slice(-8)}`;

    // --- Desktop ---
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/coach/settings");

    await expect(
      page.getByRole("heading", { name: "Configurações" }),
    ).toBeVisible();

    // Real sections.
    await expect(page.getByRole("heading", { name: "Clínica" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Preferências de feedback" }),
    ).toBeVisible();

    // Nothing on this page is a placeholder: the "WhatsApp Business" card and
    // the "Cobrança e renovação · Em breve" row were removed — the first held
    // no information, the second contradicted the Pix flow the billing banner
    // already offers.
    await expect(
      page.getByRole("heading", { name: "WhatsApp Business" }),
    ).toHaveCount(0);
    await expect(page.getByText("Em breve")).toHaveCount(0);

    // Equipe de coaches is real for the seeded owner on the Clínica plan: the
    // owner ("Admin · Coach"), a second coach, one pending invite, and the seat
    // footer (2 ocupadas + 1 pendente against 3 vagas).
    await expect(
      page.getByRole("heading", { name: "Equipe de coaches" }),
    ).toBeVisible();
    await expect(page.getByText("Admin · Coach")).toBeVisible();
    await expect(page.getByText("Bianca Reis")).toBeVisible();
    await expect(page.getByText("convite pendente")).toBeVisible();
    await expect(page.getByText(/Plano Clínica ·/)).toBeVisible();

    // Plano atual is a real read (plan name from the clinic) and now shows
    // usage vs. caps — alunos, coaches, and whether WhatsApp is included.
    const planCard = page.locator("section", {
      has: page.getByRole("heading", { name: "Plano atual" }),
    });
    await expect(planCard).toBeVisible();
    // Exact match: the plan description also contains "…alunos…/…coaches…".
    await expect(planCard.getByText("Alunos", { exact: true })).toBeVisible();
    await expect(planCard.getByText("Coaches", { exact: true })).toBeVisible();
    await expect(planCard.getByText("Incluído")).toBeVisible();

    // Faturas is a read-only card fed by the admin's manual ledger. The seed
    // gives the demo clinic two invoices (one paid, one overdue).
    const faturas = page.getByRole("heading", { name: "Faturas" });
    await expect(faturas).toBeVisible();
    await expect(page.getByText("Paga").first()).toBeVisible();
    await expect(page.getByText("Vencida").first()).toBeVisible();

    // Edit the Clínica section.
    await page.getByLabel("Nome da clínica").fill("Studio Forja");
    await page.getByLabel("Endereço do portal").fill(subdomain);

    // Pick the "Mensal" check-in frequency and confirm it becomes selected.
    const mensal = page.getByRole("radio", { name: /Mensal/ });
    await mensal.click();
    await expect(mensal).toHaveAttribute("aria-checked", "true");

    // Flip the WhatsApp reminder. The assertion is relative to what is in the
    // DB, not to the seeded "true": this test saves the flipped value, so a
    // retry — or a second run against the same database — starts from the
    // opposite state and a hard-coded "true" would fail.
    const reminder = page.getByRole("switch");
    const wasOn = (await reminder.getAttribute("aria-checked")) === "true";
    await reminder.click();
    await expect(reminder).toHaveAttribute(
      "aria-checked",
      wasOn ? "false" : "true",
    );

    // Save the whole form.
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    // "Salvo" is rendered twice — the lg header and the sticky bar below lg —
    // and only one of the two is displayed at a viewport. `exact` also keeps
    // the bar's "Não salvo" out of the match.
    await expect(
      page.getByText("Salvo", { exact: true }).filter({ visible: true }),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/clinic-settings-desktop.png",
      fullPage: true,
    });

    // The change persisted: a reload shows the saved subdomain + selection.
    await page.reload();
    await expect(page.getByLabel("Endereço do portal")).toHaveValue(subdomain);
    await expect(page.getByRole("radio", { name: /Mensal/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("heading", { name: "Configurações" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Preferências de feedback" }),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/clinic-settings-mobile.png",
      fullPage: true,
    });
  });

  test("owner manages the coach team — cancels a pending invite, then sends one", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/coach/settings");

    const team = page.locator("section", {
      has: page.getByRole("heading", { name: "Equipe de coaches" }),
    });
    await expect(team).toBeVisible();

    // At capacity (owner + 1 coach + 1 pending = 3/3): "Convidar" is disabled.
    const convidar = team.getByRole("button", { name: "Convidar" });
    await expect(convidar).toBeDisabled();

    // Cancel the seeded pending invite → a seat frees, "Convidar" enables.
    await team
      .getByRole("button", { name: /Cancelar convite/ })
      .first()
      .click();
    await expect(convidar).toBeEnabled();

    // Send a fresh invite (unique e-mail so re-runs never collide).
    const email = `novo-${Date.now().toString().slice(-8)}@example.com`;
    await convidar.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome", { exact: true }).fill("Novo Coach");
    await dialog.getByLabel("E-mail", { exact: true }).fill(email);
    await dialog.getByRole("button", { name: "Enviar convite" }).click();

    // The new pending invite appears and the seat is used again.
    await expect(team.getByText(email)).toBeVisible();
    await expect(convidar).toBeDisabled();

    await page.screenshot({
      path: "test-results/screens/coach-team-desktop.png",
      fullPage: true,
    });

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(team).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-team-mobile.png",
      fullPage: true,
    });
  });
});
