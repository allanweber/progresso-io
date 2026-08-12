import { expect, test } from "@playwright/test";

/**
 * Clinic configuration ("Configurações"). Runs in the `coach` project against
 * the seeded coach's session + the real DB. Asserts the two real, editable
 * sections (Clínica + Preferências de feedback) and the coming-soon ones, drives
 * a full save, and captures the desktop + mobile screenshots as a byproduct
 * (see the screenshots rule in AGENTS.md).
 */

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

    // Coming-soon sections render an "Em breve" body.
    await expect(
      page.getByRole("heading", { name: "WhatsApp Business" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Equipe de coaches" }),
    ).toBeVisible();
    await expect(page.getByText("Em breve").first()).toBeVisible();

    // Plano atual is a real read (plan name from the clinic).
    await expect(
      page.getByRole("heading", { name: "Plano atual" }),
    ).toBeVisible();

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
    const mensal = page.getByRole("button", { name: /Mensal/ });
    await mensal.click();
    await expect(mensal).toHaveAttribute("aria-pressed", "true");

    // Toggle the WhatsApp reminder off.
    const reminder = page.getByRole("switch");
    await expect(reminder).toHaveAttribute("aria-checked", "true");
    await reminder.click();
    await expect(reminder).toHaveAttribute("aria-checked", "false");

    // Save the whole form.
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Salvo")).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/clinic-settings-desktop.png",
      fullPage: true,
    });

    // The change persisted: a reload shows the saved subdomain + selection.
    await page.reload();
    await expect(page.getByLabel("Endereço do portal")).toHaveValue(subdomain);
    await expect(page.getByRole("button", { name: /Mensal/ })).toHaveAttribute(
      "aria-pressed",
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
});
