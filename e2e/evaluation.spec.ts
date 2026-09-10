import { expect, test } from "@playwright/test";

/**
 * The AI evaluation of a check-in, end to end: generate → edit → accept → the
 * coach-only note it becomes, and the % de gordura it puts on Evolução.
 *
 * This runs against the **stub provider** (`LLM_PROVIDER=stub`, set for the
 * suite's server in `scripts/e2e.mjs`), so the model's answer is a fixed
 * fixture and nothing leaves the process. That is the only way any of this is
 * reachable: the `dev` provider refuses, which used to leave every path after a
 * successful generation — the card, the coupled numbers, accepting, the note —
 * untestable and unscreenshottable.
 *
 * The spec makes its **own** check-in rather than using a seeded one: the suite
 * is fullyParallel, and the pending check-in on Ana's timeline is consumed by
 * `feedback.spec.ts`.
 */

const POSE_FIXTURE = "e2e/fixtures/pose.png";
const ALUNO_STORAGE = "e2e/.auth/aluno.json";

/** The stub's answer, so the assertions name what the coach actually sees. */
const STUB_SUMMARY =
  "Perda de gordura consistente, com manutenção de massa magra desde o último check-in.";
const STUB_BODY_FAT = "18,4";
const STUB_LEAN = "81,6";

async function openAnaFeedback(page: import("@playwright/test").Page) {
  await page.goto("/coach/students");
  await page
    .getByRole("button", { name: "Aceitar" })
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.getByRole("table").getByText("Ana Aluna").first().click();
  await expect(page.getByRole("heading", { name: "Ana Aluna" })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole("link", { name: "Feedback" }).click();
  await expect(
    page.getByRole("heading", { name: "Timeline de feedback" }),
  ).toBeVisible({ timeout: 20000 });
  return page.url();
}

/** Ana's id, for the API-level assertions. */
async function anaId(request: import("@playwright/test").APIRequestContext) {
  const res = await request.get("/api/students?status=active");
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as {
    students: { id: string; firstName: string }[];
  };
  const ana = body.students.find((s) => s.firstName === "Ana");
  expect(ana, "the seeded aluno Ana").toBeTruthy();
  return ana!.id;
}

test.describe("avaliação com IA", () => {
  test("evaluates a check-in, couples the numbers, and saves a coach-only note (desktop + mobile)", async ({
    page,
  }) => {
    const feedbackUrl = await openAnaFeedback(page);
    const marker = `Check-in para avaliação IA ${Date.now()}`;

    // --- Its own check-in: weight, note and a real photo (the photo pipeline
    //     downscales it through sharp on the way to the model). ---
    await page.getByRole("button", { name: "Novo check-in" }).click();
    const manual = page.getByRole("dialog");
    await expect(manual).toBeVisible();
    await manual.getByLabel(/Peso \(kg\)/).fill("71,0");
    await manual.getByLabel("Feedback / observação").fill(marker);
    await manual.getByLabel("Enviar Pose de frente").setInputFiles(POSE_FIXTURE);
    await expect(
      manual.getByRole("button", { name: "Remover Pose de frente" }),
    ).toBeVisible();
    await manual.getByRole("button", { name: "Salvar check-in" }).click();
    await expect(manual).toBeHidden();
    await expect(page.getByText(marker)).toBeVisible();

    // --- Open it and run the evaluation ---
    await page.getByText(marker).click();
    const review = page.getByRole("dialog");
    await expect(review).toBeVisible();

    const runButton = review.getByRole("button", { name: "Avaliar com IA" });
    // Never hidden — Ana has a completed anamnese and credits, so it is live.
    await expect(runButton).toBeEnabled();
    await runButton.click();

    // The evaluation opens in its OWN modal, stacked over the review dialog, so
    // the coach can never confuse the note only they see with the feedback the
    // aluno receives. Same nesting the photo lightbox already uses.
    const evaluationModal = page.getByRole("dialog", {
      name: "Avaliação com IA",
    });
    await expect(
      evaluationModal.getByRole("heading", { name: "Avaliação com IA" }),
    ).toBeVisible();

    // --- Before a credit is spent: the coach's own steer for this run, and
    //     how many generations they have left this month. ---
    const runCta = evaluationModal.getByRole("button", { name: "Avaliar com IA" });
    await expect(runCta).toBeEnabled();
    await expect(
      evaluationModal.getByText(/gerações? usadas? este mês/),
    ).toBeVisible();
    await evaluationModal
      .getByLabel("Instruções extras (opcional)")
      .fill("Focar na evolução da cintura.");
    await runCta.click();

    // --- The card: a verdict, the model's words, and the numbers ---
    await expect(evaluationModal.getByText("Ajustar")).toBeVisible({
      timeout: 20000,
    });
    await expect(
      evaluationModal.getByRole("paragraph").filter({ hasText: STUB_SUMMARY }),
    ).toBeVisible();

    const bodyFat = evaluationModal.getByLabel("% de gordura", { exact: true });
    const lean = evaluationModal.getByLabel("Massa magra %");
    await expect(bodyFat).toHaveValue(STUB_BODY_FAT);
    await expect(lean).toHaveValue(STUB_LEAN);

    // The origin travels with the number: this one was read off photographs and
    // must never render like a caliper measurement.
    await expect(
      evaluationModal.getByText(/estimativa visual \(confiança média\)/),
    ).toBeVisible();

    // The one promise the coach has to be able to trust before writing candidly.
    await expect(
      evaluationModal.getByText(/O aluno não vê esta nota nem esta avaliação/),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-ai-evaluation-desktop.png",
      fullPage: true,
    });

    // --- The pair is coupled: editing one recomputes the other ---
    await bodyFat.fill("20");
    await expect(lean).toHaveValue("80,0");
    // …and back the other way, so neither field is the "real" one.
    await lean.fill("75");
    await expect(bodyFat).toHaveValue("25,0");
    await bodyFat.fill("19,4");
    await expect(lean).toHaveValue("80,6");

    // --- Accept: the note is the coach's, so edit it first ---
    const note = evaluationModal.getByLabel("Nota (só o coach vê)");
    await note.fill(`${marker} — nota revisada pelo coach.`);
    await evaluationModal
      .getByRole("button", { name: /Aceitar e salvar nota/ })
      .click();

    // Accepting closes its modal and leaves the review dialog underneath — the
    // draft is decided, so the trigger offers a fresh evaluation again.
    await expect(
      review.getByRole("button", { name: "Avaliar com IA" }),
    ).toBeVisible({ timeout: 20000 });

    // --- The accepted percentage landed on the check-in's assessment ---
    await expect(review.getByText(/19,4% de gordura/)).toBeVisible();
    await expect(review.getByText("estimativa visual")).toBeVisible();
    await page.keyboard.press("Escape");

    // --- The note is on the Notas tab, marked as edited ---
    await page.getByRole("link", { name: "Notas" }).click();
    await expect(
      page.getByText(/Só a equipe da clínica vê estas notas/),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByText(`${marker} — nota revisada pelo coach.`),
    ).toBeVisible();
    await expect(page.getByText("Avaliação com IA").first()).toBeVisible();
    await expect(page.getByText("editada pelo coach").first()).toBeVisible();
    // The number the coach settled on, not the one the model proposed.
    await expect(page.getByText(/19,4% de gordura/)).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-student-notes-desktop.png",
      fullPage: true,
    });

    // --- And on the Evolução chart, drawn as an estimate ---
    await page.getByRole("link", { name: "Evolução" }).click();
    await expect(page.getByText("% de gordura").first()).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByText("Estimativa ou origem não registrada"),
    ).toBeVisible();

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(feedbackUrl.replace("/feedback", "/notes"));
    await expect(
      page.getByText(`${marker} — nota revisada pelo coach.`),
    ).toBeVisible({ timeout: 20000 });
    await page.screenshot({
      path: "test-results/screens/coach-student-notes-mobile.png",
      fullPage: true,
    });

    await page.goto(feedbackUrl);
    await page.getByText(marker).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // Open the evaluation modal itself on mobile — a screenshot of the trigger
    // would not say whether the modal is usable at 390 px, which is the whole
    // question.
    await page.getByRole("button", { name: "Avaliar com IA" }).click();
    const mobileModal = page.getByRole("dialog", { name: "Avaliação com IA" });
    await expect(
      mobileModal.getByRole("heading", { name: "Avaliação com IA" }),
    ).toBeVisible();
    await mobileModal.getByRole("button", { name: "Avaliar com IA" }).click();
    await expect(mobileModal.getByLabel("Nota (só o coach vê)")).toBeVisible({
      timeout: 20000,
    });
    await page.screenshot({
      path: "test-results/screens/coach-ai-evaluation-mobile.png",
      fullPage: true,
    });
    // Leave nothing pending behind — the draft this shot made is not a decision.
    await mobileModal.getByRole("button", { name: "Descartar" }).click();
    await expect(mobileModal).toBeHidden();
  });

  test("keeps the draft and the coach's text when a save fails", async ({
    page,
  }) => {
    await openAnaFeedback(page);
    const marker = `Check-in falha de save ${Date.now()}`;

    await page.getByRole("button", { name: "Novo check-in" }).click();
    const manual = page.getByRole("dialog");
    await manual.getByLabel(/Peso \(kg\)/).fill("70,0");
    await manual.getByLabel("Feedback / observação").fill(marker);
    await manual.getByRole("button", { name: "Salvar check-in" }).click();
    await expect(manual).toBeHidden();

    await page.getByText(marker).click();
    await page.getByRole("button", { name: "Avaliar com IA" }).click();
    const modal = page.getByRole("dialog", { name: "Avaliação com IA" });
    await expect(
      modal.getByRole("heading", { name: "Avaliação com IA" }),
    ).toBeVisible();
    await modal.getByRole("button", { name: "Avaliar com IA" }).click();

    const note = modal.getByLabel("Nota (só o coach vê)");
    await expect(note).toBeVisible({ timeout: 20000 });
    await note.fill(`${marker} — texto que não pode ser perdido.`);

    // Make the save fail, once.
    await page.route("**/evaluation/accept", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Falha simulada." }),
      }),
    );
    await modal.getByRole("button", { name: /Aceitar e salvar nota/ }).click();

    // The error shows — and the card, the numbers and the coach's rewritten note
    // are all still there. Replacing them with a "Tentar de novo" that re-runs
    // the generation would throw the coach's work away and bill for it.
    await expect(modal.getByText("Falha simulada.")).toBeVisible();
    await expect(note).toHaveValue(`${marker} — texto que não pode ser perdido.`);
    await expect(modal.getByLabel("% de gordura", { exact: true })).toBeVisible();

    // Letting it through, the same click saves — no regeneration in between.
    await page.unroute("**/evaluation/accept");
    await modal.getByRole("button", { name: /Aceitar e salvar nota/ }).click();
    await expect(modal).toBeHidden({ timeout: 20000 });

    // The check-in review dialog is still open underneath, and its overlay eats
    // clicks on the tabs behind it.
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Notas" }).click();
    await expect(
      page.getByText(`${marker} — texto que não pode ser perdido.`),
    ).toBeVisible({ timeout: 20000 });
  });

  test("writes and edits a manual note on the same timeline", async ({
    page,
  }) => {
    await openAnaFeedback(page);
    await page.getByRole("link", { name: "Notas" }).click();
    await expect(
      page.getByText(/Só a equipe da clínica vê estas notas/),
    ).toBeVisible({ timeout: 20000 });

    const body = `Nota manual e2e ${Date.now()}`;
    await page.getByLabel("Nova nota").fill(body);
    await page.getByRole("button", { name: "Salvar nota" }).click();

    const card = page.locator("article").filter({ hasText: body });
    await expect(card).toBeVisible();
    await expect(card.getByText("Nota do coach")).toBeVisible();

    // Editing rewrites the body and nothing else.
    await card.getByRole("button", { name: "Editar nota" }).click();
    await card.getByRole("textbox").fill(`${body} — corrigida`);
    await card.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText(`${body} — corrigida`)).toBeVisible();

    // And it can be removed — a note on the wrong aluno has to be deletable.
    const edited = page.locator("article").filter({ hasText: `${body} — corrigida` });
    await edited.getByRole("button", { name: "Excluir nota" }).click();
    await edited.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText(`${body} — corrigida`)).toBeHidden();
  });

  test("a check-in with nothing on it never exists to be evaluated", async ({
    page,
    request,
  }) => {
    const student = await anaId(request);

    // The evaluation refuses an empty check-in (`no_checkin_data`, covered in
    // tests/checkin-evaluations.integration.test.ts), but from the outside that
    // branch is unreachable — and this is why: the entry cannot be created in
    // the first place. Sparse is fine, empty is not, and the guard sits on the
    // door rather than on the credit.
    const created = await request.post(`/api/students/${student}/checkin`, {
      multipart: { date: "2026-02-02", modality: "in_person" },
    });
    expect(created.status()).toBe(422);
    expect(await created.text()).toContain("Informe ao menos um dado");

    // Nothing was written, so nothing to evaluate and no credit to claim: the
    // aluno's notes are exactly as they were.
    await page.goto(`/coach/students/${student}/notes`);
    await expect(
      page.getByText(/Só a equipe da clínica vê estas notas/),
    ).toBeVisible({ timeout: 20000 });
  });
});

/**
 * The guarantee the whole feature rests on, asserted from the aluno's own
 * session rather than from the coach's: notes are coach-only.
 */
test.describe("o aluno nunca alcança as notas", () => {
  test.use({ storageState: ALUNO_STORAGE });

  test("cannot read the notes route, even knowing the id", async ({
    request,
  }) => {
    // The aluno's own portal read works, which proves the session is real…
    const mine = await request.get("/api/student/checkin");
    expect(mine.ok(), await mine.text()).toBeTruthy();

    // …and the coach-scoped notes route is closed to it. `withCoach` answers
    // 403 for a signed-in non-coach; the id in the path is irrelevant.
    const notes = await request.get(
      "/api/students/00000000-0000-0000-0000-000000000000/notes",
    );
    expect(notes.ok()).toBeFalsy();
    expect([401, 403, 404]).toContain(notes.status());
  });
});
