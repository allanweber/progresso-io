import { expect, test } from "@playwright/test";

/**
 * The coach Calendar/Agenda. Runs in the `coach` project against the seeded
 * coach's session (Clínica plan → Calendar enabled) + the real DB. Asserts the
 * seeded events, the month/week/day views, and a create round-trip, and captures
 * the desktop + mobile screenshots as a byproduct (see the screenshots rule in
 * AGENTS.md).
 */

test.describe("coach calendar", () => {
  // The dev server compiles /coach/calendar on first hit; give it room.
  test.setTimeout(120_000);

  test("renders the agenda, views and a created event", async ({ page }) => {
    const title = `Reunião ${Date.now().toString().slice(-6)}`;

    // --- Desktop ---
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/coach/calendar");

    await expect(
      page.getByRole("heading", { name: "Calendário" }),
    ).toBeVisible();
    // The Mês/Semana/Dia toggle and the upcoming panel.
    await expect(page.getByRole("button", { name: "Mês" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Próximos 14 dias" }),
    ).toBeVisible();
    // A seeded event that always lands in the current month (dated "today").
    await expect(page.getByText("Consultoria online").first()).toBeVisible();
    // The legend.
    await expect(page.getByText("Administrativo").first()).toBeVisible();

    // Create an event via the modal and see it appear.
    await page.getByTestId("calendar-new-event").click();
    await expect(
      page.getByRole("heading", { name: "Novo evento" }),
    ).toBeVisible();
    await page.getByLabel("Título").fill(title);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(
      page.getByRole("heading", { name: "Novo evento" }),
    ).toBeHidden();
    await expect(page.getByText(title).first()).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-calendar-desktop.png",
      fullPage: true,
    });

    // --- Week view: a time grid with an all-day row ---
    await page.getByRole("button", { name: "Semana" }).click();
    await expect(page.getByText("Dia todo").first()).toBeVisible();

    // --- Day view ---
    await page.getByRole("button", { name: "Dia", exact: true }).click();
    await expect(page.getByText("Dia todo").first()).toBeVisible();

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Mês" }).click();
    await expect(
      page.getByRole("heading", { name: "Calendário" }),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-calendar-mobile.png",
      fullPage: true,
    });
  });
});
