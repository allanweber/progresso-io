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
  // The ficha route compiles cold on the first CI hit — allow for it.
  await expect(page.getByRole("heading", { name: "Ana Aluna" })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole("link", { name: "Feedback" }).click();
  await expect(
    page.getByRole("heading", { name: "Timeline de feedback" }),
  ).toBeVisible({ timeout: 20000 });
}

test.describe("coach feedback", () => {
  test("enlarges a check-in photo in a lightbox (desktop + mobile)", async ({
    page,
  }) => {
    await openAnaFeedback(page);

    // An ANSWERED entry on purpose: the suite runs fullyParallel, and the
    // review test in this file consumes the single pending check-in — depending
    // on it here would race across workers.
    await page
      .getByRole("button", { name: /respondido/ })
      .first()
      .click();
    const review = page.getByRole("dialog");
    await expect(review).toBeVisible();
    await expect(review.getByRole("img").first()).toBeVisible();

    // --- Open the lightbox (a second dialog, stacked over the review one) ---
    await review.getByRole("button", { name: "Ampliar Pose de frente" }).click();
    const lightbox = page.getByRole("dialog").last();
    await expect(
      lightbox.getByRole("heading", { name: "Pose de frente" }),
    ).toBeVisible();

    // The enlarged image is the same stream URL — assert it really decoded.
    const enlarged = lightbox.getByRole("img", { name: "Pose de frente" });
    await expect
      .poll(
        () =>
          enlarged.evaluate(
            (i) =>
              (i as HTMLImageElement).complete &&
              (i as HTMLImageElement).naturalWidth > 0,
          ),
        { timeout: 20000 },
      )
      .toBe(true);

    await page.screenshot({
      path: "test-results/screens/coach-checkin-lightbox-desktop.png",
    });

    // --- The arrows walk the four poses ---
    await page.keyboard.press("ArrowRight");
    await expect(
      lightbox.getByRole("heading", { name: "Pose de costas" }),
    ).toBeVisible();

    // --- Esc closes ONLY the lightbox; the review dialog stays open ---
    await page.keyboard.press("Escape");
    await expect(
      lightbox.getByRole("heading", { name: "Pose de costas" }),
    ).toBeHidden();
    await expect(review.getByRole("img").first()).toBeVisible();

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await review.getByRole("button", { name: "Ampliar Pose de frente" }).click();
    const mobileBox = page.getByRole("dialog").last();
    await expect(
      mobileBox.getByRole("heading", { name: "Pose de frente" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-checkin-lightbox-mobile.png",
    });
  });

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
    // The evolution route (and its photo route) compile cold in CI — allow time.
    await expect(page.getByText("Peso ao longo do tempo")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText("Fotos comparáveis")).toBeVisible();
    // The Medidas Δ table (seeded two assessments): the Cintura row is unique.
    await expect(page.getByRole("cell", { name: /Cintura/ })).toBeVisible();
    // Wait for the (first) comparable photo to actually decode before the shot —
    // scoped to one image, with a generous timeout for the cold photo route.
    const comparePhoto = page
      .getByRole("img", { name: "Pose de frente" })
      .first();
    await expect(comparePhoto).toBeVisible({ timeout: 20000 });
    await expect
      .poll(
        () =>
          comparePhoto.evaluate(
            (i) =>
              (i as HTMLImageElement).complete &&
              (i as HTMLImageElement).naturalWidth > 0,
          ),
        { timeout: 20000 },
      )
      .toBe(true);
    await page.screenshot({
      path: "test-results/screens/coach-evolution-desktop.png",
      fullPage: true,
    });

    // The comparable tiles enlarge too, captioned with the check-in's date.
    await page
      .getByRole("button", { name: /^Ampliar Pose de frente de / })
      .first()
      .click();
    const lightbox = page.getByRole("dialog");
    await expect(
      lightbox.getByRole("heading", { name: "Pose de frente" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-evolution-lightbox-desktop.png",
    });
    await page.keyboard.press("Escape");
    await expect(lightbox).toBeHidden();

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Peso ao longo do tempo")).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-evolution-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: /^Ampliar Pose de frente de / })
      .first()
      .click();
    await expect(
      lightbox.getByRole("heading", { name: "Pose de frente" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-evolution-lightbox-mobile.png",
    });
  });

  test("imports backdated check-ins and deletes one (desktop + mobile)", async ({
    page,
  }) => {
    await openAnaFeedback(page);
    const feedbackUrl = page.url();
    // Unique per run: the suite is fullyParallel and this test asserts its own
    // entries appear and then disappear.
    const stamp = String(Date.now()).slice(-6);
    const first = `Importado e2e ${stamp} A`;
    const second = `Importado e2e ${stamp} B`;

    await page.getByRole("button", { name: "Novo check-in" }).click();
    const manual = page.getByRole("dialog");
    await expect(manual).toBeVisible();
    const date = manual.getByLabel("Data do check-in");

    // Typing eight digits yields dd/mm/aaaa — the format is the product's, not
    // the device locale's (which is what the native date input would follow).
    await date.fill("11032024");
    await expect(date).toHaveValue("11/03/2024");

    // The icon opens a month grid on the typed date; picking a day writes it
    // back in the same format. Both routes into the field, one canonical value.
    await manual
      .getByRole("button", { name: "Data do check-in: escolher no calendário" })
      .click();
    const grid = page.getByRole("dialog").last();
    await expect(grid.getByText("Março de 2024")).toBeVisible();
    await grid.getByRole("button", { name: "15/03/2024" }).click();
    await expect(date).toHaveValue("15/03/2024");
    // Back to the date this test asserts on later.
    await date.fill("11032024");
    await expect(date).toHaveValue("11/03/2024");

    await manual.getByLabel(/Peso \(kg\)/).fill("80,5");
    await manual.getByLabel("Feedback / observação").fill(first);
    await page.screenshot({
      path: "test-results/screens/coach-checkin-import-desktop.png",
      fullPage: true,
    });

    // "Salvar e adicionar outro" keeps the dialog open, clears the entry fields
    // and KEEPS the date — importing history means typing many in a row.
    await manual.getByRole("button", { name: "Salvar e adicionar outro" }).click();
    await expect(manual.getByText("Check-in de 11/03/2024 salvo.")).toBeVisible();
    await expect(manual.getByLabel(/Peso \(kg\)/)).toHaveValue("");
    await expect(date).toHaveValue("11/03/2024");

    await date.fill("18032024");
    await manual.getByLabel("Feedback / observação").fill(second);
    await manual.getByRole("button", { name: "Salvar check-in" }).click();
    await expect(manual).toBeHidden();

    // Both land on the timeline under their own PAST dates, not today's.
    await expect(page.getByText(first)).toBeVisible();
    await expect(page.getByText(second)).toBeVisible();
    await expect(page.getByText("11/03/2024").first()).toBeVisible();
    await expect(page.getByText("18/03/2024").first()).toBeVisible();

    // --- Delete one of them; the confirmation names the date ---
    await page.getByRole("button", { name: new RegExp(first) }).click();
    const detail = page.getByRole("dialog");
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: "Excluir check-in" }).click();
    await expect(
      detail.getByText(/Excluir o check-in de 11\/03\/2024/),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-checkin-delete-desktop.png",
    });
    await detail
      .getByRole("button", { name: "Excluir definitivamente" })
      .click();
    await expect(detail).toBeHidden();

    // Gone from the timeline — and only that one.
    await expect(page.getByText(first)).toBeHidden();
    await expect(page.getByText(second)).toBeVisible();

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(feedbackUrl);
    await expect(
      page.getByRole("heading", { name: "Timeline de feedback" }),
    ).toBeVisible();
    await expect(page.getByText(second)).toBeVisible();
    await page.getByRole("button", { name: "Novo check-in" }).click();
    const mobileManual = page.getByRole("dialog");
    await expect(mobileManual.getByLabel("Data do check-in")).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-checkin-import-mobile.png",
      fullPage: true,
    });
  });
});
