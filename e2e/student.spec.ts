import { expect, test } from "@playwright/test";

/**
 * The aluno portal (`/student`), against the real DB (see scripts/e2e.mjs).
 * Runs in the `student` project, reusing the seeded aluno's saved session. The
 * seed publishes an active "Cutting" diet + an archived "Adaptação" one.
 */

test.describe("aluno portal", () => {
  test("opens on the active diet with its meals", async ({ page }) => {
    await page.goto("/student");

    // The tab opens on Dieta: the active diet, its badge, meals and foods.
    await expect(
      page.getByRole("heading", { name: "Cutting" }),
    ).toBeVisible();
    await expect(page.getByText("v1 vigente")).toBeVisible();
    await expect(page.getByText("Café da manhã")).toBeVisible();
    await expect(page.getByText("Pão, trigo, francês")).toBeVisible();
  });

  test("opens a food's macros + substitutions in a dialog", async ({
    page,
  }) => {
    await page.goto("/student");

    await page.getByRole("button", { name: /Arroz, tipo 1, cozido/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Distribuição de macros")).toBeVisible();
    await expect(dialog.getByText("Substituições equivalentes")).toBeVisible();
    await expect(dialog.getByText(/Batata, doce/)).toBeVisible();
  });

  test("shows the read-only history and opens an archived version", async ({
    page,
  }) => {
    await page.goto("/student");

    await expect(page.getByText("Dietas anteriores")).toBeVisible();
    await page.getByRole("button", { name: /Adaptação/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("somente leitura")).toBeVisible();
  });

  test("renders the mobile chrome (bottom tab bar)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/student");

    // Dismiss the app-wide cookie banner — it's a fixed bottom bar that would
    // otherwise cover the mobile tab bar.
    await page.getByRole("button", { name: "Aceitar" }).click();

    // Greeting in the mobile header + the active diet still shows.
    await expect(page.getByText("Oi, Ana!")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cutting" }),
    ).toBeVisible();
    // The "em breve" tabs are reachable from the bottom bar.
    await page.getByRole("button", { name: "Evolução" }).click();
    await expect(page.getByText(/Em breve/)).toBeVisible();
  });
});
