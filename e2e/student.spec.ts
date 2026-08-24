import { expect, test } from "@playwright/test";

/**
 * The aluno portal (`/student`), against the real DB (see scripts/e2e.mjs).
 * Runs in the `student` project, reusing the seeded aluno's saved session. The
 * seed publishes an active "Cutting" diet + an archived "Adaptação" one.
 */

/**
 * Pre-accept the cookie banner (the pattern admin-admins/admin-maintenance
 * already use). It carries `role="dialog"`, so a bare `getByRole("dialog")`
 * matches it as well as a Radix dialog — and because consent is read from
 * localStorage in an effect, the banner mounts *after* first paint. That race
 * made "open the dialog, Escape, expect it hidden" fail: by the time the
 * assertion ran, the locator had resolved to the still-visible banner. It also
 * keeps the portal screenshots free of a strip that covers the bottom of the
 * mobile viewport.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("progresso-cookie-consent", "accepted"),
  );
});

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

  test("reads at the aluno's posture, inline and inside a portalled dialog (desktop + mobile)", async ({
    page,
  }) => {
    // The portal and the coach app share one type ramp; `.posture-reading`
    // steps the reading rungs up one notch for the aluno (globals.css). Radix
    // portals dialog content to <body>, outside the portal's subtree, so the
    // posture has to ride on the dialog itself — that is what this asserts.
    const px = (l: import("@playwright/test").Locator) =>
      l.evaluate((el) => getComputedStyle(el).fontSize);

    for (const [label, size] of [
      ["desktop", { width: 1280, height: 900 }],
      ["mobile", { width: 390, height: 844 }],
    ] as const) {
      await page.setViewportSize(size);
      await page.goto("/student");

      // Inline: a meal name is `text-subtitle`, a food row `text-body-dense`.
      const meal = page.getByText("Café da manhã");
      await expect(meal).toBeVisible();
      expect(await px(meal)).toBe("16px");

      const food = page.getByRole("button", { name: /Arroz/ }).first();
      expect(await px(food)).toBe("14px");

      await page.screenshot({
        path: `test-results/screens/portal-type-${label}.png`,
        fullPage: true,
      });

      // Portalled: the food dialog renders under <body>, and still reads at
      // the aluno's posture rather than falling back to the coach's density.
      await food.click();
      const dialog = page
        .getByRole("dialog")
        .filter({ hasNot: page.getByRole("button", { name: "Aceitar" }) });
      await expect(dialog).toBeVisible();
      expect(await px(dialog.getByText(/Batata/).first())).toBe("14px");
      await dialog.screenshot({
        path: `test-results/screens/portal-type-dialog-${label}.png`,
      });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  });

  test("renders the mobile chrome (bottom tab bar)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/student");

    // Greeting in the mobile header + the active diet still shows.
    await expect(page.getByText("Oi, Ana!")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cutting" }),
    ).toBeVisible();
    // Evolução is reachable from the bottom bar and shows the seeded history.
    await page.getByRole("button", { name: "Evolução" }).click();
    await expect(
      page.getByRole("heading", { name: "Minha evolução" }),
    ).toBeVisible();
    await expect(page.getByText("Histórico de check-ins")).toBeVisible();
  });

  test("submits a check-in with the four photos and a live upload bar (desktop + mobile)", async ({
    page,
  }) => {
    // A real gradient image stands in for each pose photo; the browser
    // compresses it client-side before upload (storage falls back to local disk
    // in e2e).
    const POSE_FIXTURE = "e2e/fixtures/pose.png";
    const POSES = [
      "Pose de frente",
      "Pose de costas",
      "Pose lado esquerdo",
      "Pose lado direito",
    ];

    // --- Desktop ---
    await page.goto("/student");
    await page.getByRole("button", { name: "Check-in" }).first().click();

    // The header reflects the clinic's check-in cadence (Configurações). The
    // frequency word is not hardcoded here: the coach `settings` project runs in
    // parallel against the same seeded clinic and may change it, so match any
    // cadence — the point is that the clinic config drives this text.
    await expect(
      page.getByRole("heading", { name: /^Check-in (semanal|quinzenal|mensal)$/ }),
    ).toBeVisible();
    await expect(
      page.getByText(/(Semanal|Quinzenal|Mensal) · /),
    ).toBeVisible();
    await expect(page.getByText("Como tirar as fotos")).toBeVisible();

    // Weight + note.
    await page.getByLabel("Peso atual (kg)").fill("71,2");
    await page
      .getByLabel("Como foi a semana?")
      .fill("Semana ótima, bati todas as séries.");

    // Attach all four poses; each compresses to a thumbnail (its "Remover"
    // button appears once ready).
    for (const label of POSES) {
      await page
        .getByLabel(`Enviar ${label}`)
        .setInputFiles(POSE_FIXTURE);
      await expect(
        page.getByRole("button", { name: `Remover ${label}` }),
      ).toBeVisible();
    }

    await page.screenshot({
      path: "test-results/screens/portal-checkin-desktop.png",
      fullPage: true,
    });

    // Submit → the determinate upload bar shows, then the success state.
    await page.getByRole("button", { name: "Enviar check-in" }).click();
    await expect(
      page.getByText(/Check-in enviado ao seu coach/),
    ).toBeVisible();

    // The new check-in shows up live on Evolução.
    await page.getByRole("button", { name: "Evolução" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Minha evolução" }),
    ).toBeVisible();
    await expect(page.getByText("Histórico de check-ins")).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/portal-evolucao-desktop.png",
      fullPage: true,
    });

    // Open the just-submitted check-in → modal shows the note + the pose photos.
    await page.getByRole("button", { name: /71,2 kg/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Semana ótima, bati todas as séries."),
    ).toBeVisible();
    await expect(
      dialog.getByRole("img", { name: "Pose de frente" }),
    ).toBeVisible();
    await expect(dialog.getByRole("img")).toHaveCount(4);
    // Wait for the four photos to actually decode before capturing (a visible
    // <img> isn't necessarily loaded), so the shot shows the real images.
    await expect
      .poll(() =>
        dialog
          .getByRole("img")
          .evaluateAll((imgs) =>
            imgs.every(
              (i) =>
                (i as HTMLImageElement).complete &&
                (i as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await dialog.screenshot({
      path: "test-results/screens/portal-checkin-detail-desktop.png",
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // --- Mobile --- the check-in form on a phone viewport.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Check-in" }).first().click();
    await expect(
      page.getByRole("heading", { name: /^Check-in (semanal|quinzenal|mensal)$/ }),
    ).toBeVisible();
    await page.getByLabel("Peso atual (kg)").fill("71,2");
    for (const label of POSES) {
      await page
        .getByLabel(`Enviar ${label}`)
        .setInputFiles(POSE_FIXTURE);
      await expect(
        page.getByRole("button", { name: `Remover ${label}` }),
      ).toBeVisible();
    }
    // Bring the photo grid into view and capture the VIEWPORT (not fullPage), so
    // the fixed bottom tab bar shows pinned to the bottom (a fullPage shot would
    // render the fixed bar mid-image). Assert the bar sits within the viewport.
    await page.getByText("Como tirar as fotos").scrollIntoViewIfNeeded();
    const tabBar = page.getByRole("button", { name: "Evolução" }).last();
    const box = await tabBar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThan(844 - 120); // near the bottom edge (844 tall)
    await page.screenshot({
      path: "test-results/screens/portal-checkin-mobile.png",
      fullPage: false,
    });
  });
});
