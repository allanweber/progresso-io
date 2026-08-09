import { expect, test } from "@playwright/test";

/**
 * The aluno portal (`/student`), against the real DB (see scripts/e2e.mjs).
 * Runs in the `student` project, reusing the seeded aluno's saved session. The
 * seed publishes an active "Cutting" diet + an archived "Adaptação" one.
 */

test.describe("aluno portal", () => {
  test("opens on the active diet with its meals", async ({ page }) => {
    await page.goto("/student");

    // The tab opens on Dieta: the active diet, its badge, meals and foods (the
    // seed references real catalog foods, so match on partial descriptions).
    await expect(
      page.getByRole("heading", { name: "Cutting" }),
    ).toBeVisible();
    await expect(page.getByText("v1 vigente")).toBeVisible();
    await expect(page.getByText("Café da manhã")).toBeVisible();
    await expect(page.getByText(/Arroz/).first()).toBeVisible();
    // Foods with swaps show a small indicator in the list (not the full list).
    await expect(page.getByText(/substituiç(ão|ões)/).first()).toBeVisible();
  });

  test("shows a food's catalog substitutions (live) in the dialog", async ({
    page,
  }) => {
    await page.goto("/student");

    // The seed gives arroz a base catalog substitute (batata doce), derived live
    // — no snapshot. Open arroz and confirm the swap shows in the dialog.
    await page.getByRole("button", { name: /Arroz/ }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Distribuição de macros")).toBeVisible();
    await expect(dialog.getByText("Substituições equivalentes")).toBeVisible();
    await expect(dialog.getByText(/Batata/)).toBeVisible();
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

  test("shows the active workout and an exercise's technique in the Treino tab (desktop + mobile)", async ({
    page,
  }) => {
    // The exercise-image host isn't reachable from the e2e browser — fulfil
    // image requests with a stand-in so the detail's media area renders (real
    // catalog photos are served from R2 in production).
    await page.route(/\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i, (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#334155"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><text x="50%" y="50%" fill="#94a3b8" font-family="sans-serif" font-size="15" text-anchor="middle" dominant-baseline="middle">Exercício</text></svg>`,
      }),
    );

    // --- Desktop ---
    await page.goto("/student");
    // Accept the app-wide cookie banner up front (unobstructed on desktop), so
    // both the desktop and mobile shots are clean and the mobile bottom bar is
    // never covered by it.
    await page.getByRole("button", { name: "Aceitar" }).click();
    // The portal opens on Dieta — switch to Treino.
    await page.getByRole("button", { name: "Treino" }).first().click();

    // The seed publishes an active "Hipertrofia · 4x semana" with a drop set.
    await expect(
      page.getByRole("heading", { name: /Hipertrofia/ }),
    ).toBeVisible();
    await expect(page.getByText(/Ficha A/)).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/portal-treino-desktop.png",
      fullPage: true,
    });

    // Open the drop-set exercise → its live técnica explanation shows.
    await page.getByText(/Drop set/).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Técnica: Drop set/)).toBeVisible();
    await expect(dialog.getByText(/Como executar/)).toBeVisible();
    await dialog.screenshot({
      path: "test-results/screens/portal-exercise-detail-desktop.png",
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // --- Mobile --- the Treino tab stays selected across the resize (local
    // state, no re-navigation), so we don't tap the bottom bar — in dev the
    // Next.js overlay sits over the bottom-left corner and would intercept it.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("heading", { name: /Hipertrofia/ }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/portal-treino-mobile.png",
      fullPage: true,
    });

    // Mobile exercise detail (an exercise row is mid-page, not covered by the
    // dev overlay).
    await page.getByText(/Drop set/).first().click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Técnica: Drop set/)).toBeVisible();
    await dialog.screenshot({
      path: "test-results/screens/portal-exercise-detail-mobile.png",
    });
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
