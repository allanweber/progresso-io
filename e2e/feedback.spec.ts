import { expect, test } from "@playwright/test";

/**
 * The coach Feedback + Evolução tabs on a student's ficha (`/coach/students/[id]`),
 * against the real seeded DB. Runs in the `coach` project (seeded coach session).
 * The seed gives "Ana Aluna" a check-in timeline with a PENDING student check-in
 * to respond to, coach entries, and two assessments (so Evolução has a Δ table).
 */

const POSE_FIXTURE = "e2e/fixtures/pose.png";

async function openAnaFeedback(page: import("@playwright/test").Page) {
  await page.goto("/coach/students");
  // Dismiss the app-wide cookie banner if present (short-timeout, optional).
  await page
    .getByRole("button", { name: "Aceitar" })
    .click({ timeout: 3000 })
    .catch(() => {});
  // The desktop roster is a table whose ROWS navigate on click (router.push) —
  // there's no name link on desktop (that's the mobile card view). Clicking the
  // name cell bubbles to the row's onClick. Scope to the table so the (hidden)
  // mobile card list never matches.
  await page.getByRole("table").getByText("Ana Aluna").first().click();
  await expect(page.getByRole("heading", { name: "Ana Aluna" })).toBeVisible();
  await page.getByRole("link", { name: "Feedback" }).click();
  await expect(
    page.getByRole("heading", { name: "Timeline de feedback" }),
  ).toBeVisible();
}

test.describe("coach feedback", () => {
  test("reviews a pending check-in and logs a manual one (desktop + mobile)", async ({
    page,
  }) => {
    await openAnaFeedback(page);
    const feedbackUrl = page.url();

    // The seeded timeline has a pending student check-in and answered ones.
    await expect(page.getByText("aguarda resposta").first()).toBeVisible();
    await expect(page.getByText("respondido").first()).toBeVisible();

    // --- Respond to a pending check-in ---
    await page
      .getByRole("button", { name: /aguarda resposta/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The aluno's photos are shown; wait for them to actually decode.
    await expect(dialog.getByRole("img").first()).toBeVisible();
    await dialog.getByLabel("Seu feedback").fill(
      "Ótima evolução! Vamos ajustar o descanso do supino para 90s.",
    );
    // Capture measures too.
    await dialog.getByRole("button", { name: /Registrar medidas/ }).click();
    await dialog.getByLabel(/Cintura/).fill("78");
    await dialog.getByLabel(/de gordura/).fill("18,2");
    await page.screenshot({
      path: "test-results/screens/coach-feedback-review-desktop.png",
      fullPage: true,
    });
    await dialog.getByRole("button", { name: /Enviar feedback/ }).click();
    // On success the dialog closes (the mutation resolved end-to-end).
    await expect(dialog).toBeHidden();

    // --- Log a manual (in-person) check-in ---
    await page.getByRole("button", { name: "Novo check-in" }).click();
    const manual = page.getByRole("dialog");
    await expect(manual).toBeVisible();
    await manual.getByLabel(/Peso \(kg\)/).fill("71,0");
    await manual
      .getByLabel("Feedback / observação")
      .fill("Avaliação presencial e2e — cintura −2 cm.");
    await manual.getByLabel("Enviar Pose de frente").setInputFiles(POSE_FIXTURE);
    await expect(
      manual.getByRole("button", { name: "Remover Pose de frente" }),
    ).toBeVisible();
    await manual.getByRole("button", { name: /Registrar medidas/ }).click();
    await manual.getByLabel(/Cintura/).fill("77");
    await manual.getByRole("button", { name: "Salvar check-in" }).click();
    await expect(manual).toBeHidden();
    // The new coach entry shows on the timeline.
    await expect(
      page.getByText("Avaliação presencial e2e — cintura −2 cm."),
    ).toBeVisible();

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(feedbackUrl);
    await expect(
      page.getByRole("heading", { name: "Timeline de feedback" }),
    ).toBeVisible();
    await expect(page.getByText("respondido").first()).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-feedback-mobile.png",
      fullPage: true,
    });
  });

  test("shows the evolution: weight chart, comparable photos, medidas Δ (desktop + mobile)", async ({
    page,
  }) => {
    await openAnaFeedback(page);
    await page.getByRole("link", { name: "Evolução" }).click();

    // Weight chart + the Medidas Δ table (seeded two assessments) + photos.
    await expect(page.getByText("Peso ao longo do tempo")).toBeVisible();
    await expect(page.getByText("Fotos comparáveis")).toBeVisible();
    // The Medidas Δ table (seeded two assessments): the Cintura row is unique.
    await expect(
      page.getByRole("cell", { name: /Cintura/ }),
    ).toBeVisible();
    // Wait for the comparable photos to decode before the shot.
    await expect
      .poll(() =>
        page
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
    await page.screenshot({
      path: "test-results/screens/coach-evolution-desktop.png",
      fullPage: true,
    });

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Peso ao longo do tempo")).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-evolution-mobile.png",
      fullPage: true,
    });
  });
});
