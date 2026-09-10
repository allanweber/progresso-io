import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The AI program generator's entry point, on the seeded coach's session and the
 * real DB (see scripts/e2e.mjs).
 *
 * No paid provider is reachable from here and none should be: the suite pins
 * `LLM_PROVIDER=stub` (see scripts/e2e.mjs), which answers with a fixed fixture
 * and never leaves the process. So the model's words are not what these tests
 * assert — everything around the call is: the gate that decides whether a coach
 * may press the button, the questions each dialog asks (treino and dieta ask
 * different ones), and what a coach is left holding afterwards, which is an
 * unpublished draft.
 *
 * **Every generating test works on an aluno it created itself.** Generating
 * WRITES a draft, the suite is fullyParallel, and pointed at the seeded Ana this
 * project rewrote the diet `portfolio.spec.ts` photographs while that spec was
 * reading it. `alunoWithAnamnesis` below is the fix, and it also makes the
 * assertions honest: a fresh aluno has nothing published, so the draft notice is
 * the screen rather than a line buried under a published program.
 *
 * The prompt assembly and the salvage/rebalance passes are covered by
 * `tests/ai-generator.integration.test.ts` against a fake provider.
 */

type StudentList = { students: { id: string; firstName: string }[] };

type Question = {
  key: string;
  type: "short_text" | "long_text" | "boolean";
  mask?: "date" | "integer" | "decimal" | "pressure";
  min?: number;
  max?: number;
};
type AnamnesisSnapshot = {
  anamnesis: { sections: { questions: Question[] }[] } | null;
};

async function anaId(request: APIRequestContext): Promise<string> {
  const { students } = (await (
    await request.get("/api/students")
  ).json()) as StudentList;
  const ana = students.find((s) => s.firstName === "Ana");
  expect(ana, "the seeded aluno with a completed anamnese").toBeTruthy();
  return ana!.id;
}

/** A number the question will accept, whatever bounds it declares. */
function inBounds(value: number, q: Question): number {
  if (q.min != null && value < q.min) return q.min;
  if (q.max != null && value > q.max) return q.max;
  return value;
}

/** A plausible answer for one question, shaped by its mask. */
function answerFor(q: Question): string | boolean {
  if (q.type === "boolean") return false;
  switch (q.mask) {
    case "date":
      return "01/05/1990";
    case "pressure":
      return "120/80";
    case "integer":
      return String(inBounds(30, q));
    case "decimal":
      return String(inBounds(71.4, q)).replace(".", ",");
    default:
      return "Sem particularidades.";
  }
}

/**
 * A brand-new aluno with a completed anamnese — nothing published, nothing
 * shared with another spec.
 *
 * The anamnese is answered rather than merely stamped: `peso_atual` is what
 * turns "alta proteína" into grams on the dieta side, so an aluno filled with
 * `{}` would exercise a path no real coach reaches.
 */
async function alunoWithAnamnesis(
  request: APIRequestContext,
  tag: string,
): Promise<string> {
  const { items } = (await (
    await request.get("/api/anamneses?pageSize=100")
  ).json()) as { items: { id: string }[] };
  expect(items[0], "a seeded anamnese template").toBeTruthy();

  const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const created = await request.post("/api/students", {
    data: {
      firstName: "IA",
      lastName: tag,
      // Offline: this aluno exists to be generated for, and an online one would
      // fire a WhatsApp anamnese invite nobody is going to answer.
      modality: "in_person",
      email: `ia-${unique}@example.com`,
      phone: "",
      goal: "hipertrofia",
      anamnesisId: items[0].id,
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { student } = (await created.json()) as { student: { id: string } };

  const snapshot = (await (
    await request.get(`/api/students/${student.id}/anamnesis`)
  ).json()) as AnamnesisSnapshot;
  expect(snapshot.anamnesis, "the assigned anamnese snapshot").toBeTruthy();
  const answers: Record<string, string | boolean> = {};
  for (const section of snapshot.anamnesis!.sections) {
    for (const q of section.questions) answers[q.key] = answerFor(q);
  }
  // The coach filling it in is what completes an offline aluno's anamnese —
  // the same PUT the profile screen uses — and completed is the gate the
  // generator checks.
  const filled = await request.put(`/api/students/${student.id}/anamnesis`, {
    data: { answers },
  });
  expect(filled.ok(), await filled.text()).toBeTruthy();

  return student.id;
}

test.describe("ai program generator", () => {
  test("offers the generator on Treino, asks only the treino questions, and drafts one (desktop + mobile)", async ({
    page,
    request,
  }) => {
    const student = await alunoWithAnamnesis(request, "Treino");
    const workoutUrl = `/coach/students/${student}/workout`;
    await page.goto(workoutUrl);

    const trigger = page.getByRole("button", { name: "Gerar treino com IA" });
    const replace = page.getByRole("button", { name: "Substituir rascunho" });
    await expect(trigger).toBeEnabled();
    await trigger.click();

    // The treino form, per docs/ai-generator.md — and *only* it. Dietary
    // restrictions belong to the dieta dialog; the workout prompt's rules never
    // mention them.
    await expect(page.getByLabel("Objetivo")).toBeVisible();
    await expect(page.getByText("Equipamentos disponíveis")).toBeVisible();
    await expect(page.getByLabel("Dias por semana")).toHaveValue("3");
    await expect(page.getByText("Restrições alimentares")).toBeHidden();
    await expect(page.getByText("Refeições do dia")).toBeHidden();

    // Objetivo is the one field both kinds share, so its example is the one
    // place treino and dieta copy can silently swap. It reaches the model
    // verbatim, and it is the only hint the field gives.
    await expect(page.getByLabel("Objetivo")).toHaveAttribute(
      "placeholder",
      /hipertrofia/,
    );

    // Remaining credits are shown before spending one, not after.
    await expect(page.getByText(/gerações? usadas? este mês/)).toBeVisible();

    // Submit stays disabled until the two required answers are given.
    const submit = page.getByRole("button", { name: "Gerar", exact: true });
    await expect(submit).toBeDisabled();
    await page.getByLabel("Objetivo").fill("hipertrofia");
    await expect(submit).toBeDisabled(); // still no equipment
    await page.getByText("Academia completa").click();
    await expect(submit).toBeEnabled();

    await page.screenshot({
      path: "test-results/screens/coach-ai-generator-desktop.png",
      fullPage: true,
    });

    // The suite runs against the stub provider (see scripts/e2e.mjs), so this
    // generates for real. That is the whole point of the stub — the paths AFTER
    // a successful generation used to be unreachable from here.
    await submit.click();
    await expect(page.getByLabel("Objetivo")).toBeHidden();

    // The coach lands IN the treino that was written, not on a notice about it:
    // the builder opens on the draft, already named by the generation.
    await expect(page.getByLabel("Nome do treino")).toHaveValue(
      "Treino de teste",
      { timeout: 20000 },
    );

    // And it is a draft, not a publish: the aluno still sees nothing. A reload
    // proves the draft was persisted rather than only held in the builder.
    await page.reload();
    await expect(page.getByText(/Rascunho não publicado/)).toBeVisible({
      timeout: 20000,
    });

    // Mobile — the dialog is the thing worth photographing, so reopen it. With
    // a draft on the aluno now, this is also where the overwrite gate is real:
    // it has to name what is lost, not just ask "tem certeza?".
    await page.setViewportSize({ width: 390, height: 844 });
    await trigger.click();
    await expect(page.getByText(/substitui o rascunho atual/)).toBeVisible();
    await replace.click();
    await expect(page.getByLabel("Objetivo")).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-ai-generator-mobile.png",
      fullPage: true,
    });
  });

  test("brings back the answers the last generation asked for, per aluno", async ({
    page,
    request,
  }) => {
    const student = await alunoWithAnamnesis(request, "Memoria");
    const workoutUrl = `/coach/students/${student}/workout`;
    await page.goto(workoutUrl);

    const trigger = page.getByRole("button", { name: "Gerar treino com IA" });
    const replace = page.getByRole("button", { name: "Substituir rascunho" });
    const submit = page.getByRole("button", { name: "Gerar", exact: true });

    await trigger.click();
    if (await replace.isVisible()) await replace.click();
    await page.getByLabel("Objetivo").fill("força máxima no agachamento");
    await page.getByText("Halteres").click();
    await page.getByLabel("Dias por semana").fill("5");
    // The answers are remembered on submit, so they have to survive the dialog
    // closing on success — a coach who regenerates starts from what they asked
    // for last time, not from a blank form.
    await submit.click();
    await expect(page.getByLabel("Objetivo")).toBeHidden();

    // A successful generation opens the builder on the new draft; step back out
    // of it, because the trigger lives on the page underneath.
    await page.goto(workoutUrl);
    await trigger.click();
    if (await replace.isVisible()) await replace.click();
    await expect(page.getByLabel("Objetivo")).toHaveValue(
      "força máxima no agachamento",
    );
    await expect(page.getByLabel("Dias por semana")).toHaveValue("5");
    await expect(page.getByRole("checkbox", { name: "Halteres" })).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "Academia completa" }),
    ).not.toBeChecked();

    // A full page load, not just a reopen: the point is that it outlives the
    // session, not that React kept the state around.
    await page.reload();
    await trigger.click();
    if (await replace.isVisible()) await replace.click();
    await expect(page.getByLabel("Dias por semana")).toHaveValue("5");

    // The other aluno is untouched — these are answers about a person, and
    // leaking them across alunos would be worse than not remembering at all.
    // Read-only on Ana: the dialog is opened and abandoned, never submitted.
    await page.goto(`/coach/students/${await anaId(request)}/workout`);
    await trigger.click();
    if (await replace.isVisible()) await replace.click();
    await expect(page.getByLabel("Dias por semana")).toHaveValue("3");
  });

  test("a student with no anamnese gets the button disabled with the reason, never hidden", async ({
    page,
    request,
  }) => {
    // Freshly registered → no anamnese filled yet. This is the blocker a coach
    // hits most, and the whole point of showing it on a disabled button is that
    // the fix is one tab away.
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const created = await request.post("/api/students", {
      data: {
        firstName: "Sem",
        lastName: "Anamnese",
        modality: "in_person",
        email: `sem-anamnese-${unique}@example.com`,
        phone: "",
        goal: "",
        anamnesisId: "",
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const { student } = (await created.json()) as { student: { id: string } };

    await page.goto(`/coach/students/${student.id}/workout`);

    const trigger = page.getByRole("button", { name: "Gerar treino com IA" });
    await expect(trigger).toBeVisible();
    await expect(trigger).toBeDisabled();
    await expect(
      page.getByText("Este aluno precisa de uma anamnese preenchida."),
    ).toBeVisible();
  });

  test("the Dieta tab asks its own questions and needs no equipment (desktop + mobile)", async ({
    page,
    request,
  }) => {
    const student = await alunoWithAnamnesis(request, "Dieta");
    const dietUrl = `/coach/students/${student}/diet`;
    await page.goto(dietUrl);

    const trigger = page.getByRole("button", { name: "Gerar dieta com IA" });
    const replace = page.getByRole("button", { name: "Substituir rascunho" });
    await expect(trigger).toBeEnabled();
    await trigger.click();
    if (await replace.isVisible()) await replace.click();

    // The dieta form — and none of the treino's answers.
    await expect(page.getByLabel("Objetivo")).toBeVisible();
    await expect(page.getByText("Restrições alimentares")).toBeVisible();
    await expect(page.getByText("Equipamentos disponíveis")).toBeHidden();
    await expect(page.getByLabel("Dias por semana")).toBeHidden();

    // The day is described by NAMING the meals, not by counting them — that is
    // what lets the prompt keep arroz-e-feijão out of the café da manhã. The
    // everyday five open ticked; the two training meals do not, because they
    // only make sense next to a session.
    const meals = page.getByRole("group", { name: "Refeições do dia" });
    await expect(meals.getByRole("checkbox", { name: "Café da manhã" })).toBeChecked();
    await expect(meals.getByRole("checkbox", { name: "Almoço" })).toBeChecked();
    await expect(meals.getByRole("checkbox", { name: "Pré-treino" })).not.toBeChecked();
    await expect(meals.getByRole("checkbox", { name: "Pós-treino" })).not.toBeChecked();
    // The count is the optional second way to answer, so it opens blank.
    await expect(page.getByLabel("Total de refeições no dia")).toHaveValue("");

    // ...including the shared Objetivo field's example, which used to suggest a
    // training split to a coach writing a dieta.
    await expect(page.getByLabel("Objetivo")).toHaveAttribute(
      "placeholder",
      /emagrecimento/,
    );
    await expect(page.getByLabel("Objetivo")).not.toHaveAttribute(
      "placeholder",
      /hipertrofia|membros inferiores/,
    );

    // Treino and dieta are separate generations, and the dialog says so before
    // a credit is spent.
    await expect(
      page.getByText(/Treino e dieta são gerações separadas/),
    ).toBeVisible();

    // The regression this split fixes: with the objective prefilled from Ana's
    // goal and no equipment ticked anywhere, a dieta is already generatable.
    // Sharing the treino's schema made that impossible.
    const submit = page.getByRole("button", { name: "Gerar", exact: true });
    await expect(page.getByLabel("Objetivo")).not.toHaveValue("");
    await expect(submit).toBeEnabled();

    // The objective is still genuinely required, though.
    await page.getByLabel("Objetivo").fill("");
    await expect(submit).toBeDisabled();
    await page.getByLabel("Objetivo").fill("emagrecimento");
    await expect(submit).toBeEnabled();

    // The day can be answered three ways, and the dialog has to accept all of
    // them: ticked meals (above), a bare total, or both. Untick everything and
    // the total alone is a complete answer.
    const total = page.getByLabel("Total de refeições no dia");
    for (const name of [
      "Café da manhã",
      "Lanche da manhã",
      "Almoço",
      "Lanche da tarde",
      "Jantar",
    ]) {
      await meals.getByRole("checkbox", { name }).uncheck();
    }
    await expect(submit).toBeDisabled();
    await expect(
      page.getByText("Escolha as refeições ou informe quantas por dia."),
    ).toBeVisible();
    await total.fill("6");
    await expect(submit).toBeEnabled();

    // Both together: the ticked meals are mandatory inside the total, so a
    // total below them describes a day nobody can build — and it says so
    // before a credit is spent.
    await meals.getByRole("checkbox", { name: "Almoço" }).check();
    await meals.getByRole("checkbox", { name: "Jantar" }).check();
    await total.fill("1");
    await expect(submit).toBeDisabled();
    await total.fill("5");
    await expect(submit).toBeEnabled();
    await total.fill("");
    await expect(submit).toBeEnabled();

    // The macro profile is the shape of the plan, without asking the coach to
    // calculate grams. Combinations are the point — alta proteína com baixo
    // carbo is the classic cut — but two of them describe no buildable day.
    const macros = page.getByRole("group", { name: "Perfil de macros" });
    await macros.getByRole("checkbox", { name: "Alta proteína" }).check();
    await macros.getByRole("checkbox", { name: "Baixo carboidrato" }).check();
    await expect(submit).toBeEnabled();

    await macros.getByRole("checkbox", { name: "Alto carboidrato" }).check();
    await expect(submit).toBeDisabled();
    await expect(
      page.getByText("Escolha alto ou baixo carboidrato — não os dois."),
    ).toBeVisible();
    await macros.getByRole("checkbox", { name: "Alto carboidrato" }).uncheck();
    await expect(submit).toBeEnabled();

    // The subtler pair: cut carbs and fat and protein carries the whole day.
    await macros.getByRole("checkbox", { name: "Baixa gordura" }).check();
    await expect(submit).toBeDisabled();
    await macros.getByRole("checkbox", { name: "Baixo carboidrato" }).uncheck();
    await expect(submit).toBeEnabled();

    await page.screenshot({
      path: "test-results/screens/coach-ai-generator-diet-desktop.png",
      fullPage: true,
    });

    // Same path as Treino: the stub generates, the builder opens on the dieta it
    // wrote, and a reload shows it is still only a draft.
    await submit.click();
    await expect(page.getByLabel("Objetivo")).toBeHidden();
    await expect(page.getByLabel("Nome da dieta")).toHaveValue("Dieta de teste", {
      timeout: 20000,
    });
    await page.reload();
    await expect(page.getByText(/Rascunho não publicado/)).toBeVisible({
      timeout: 20000,
    });

    // Mobile: the dialog again, reopened past the overwrite gate the draft above
    // now puts in front of it.
    await page.setViewportSize({ width: 390, height: 844 });
    await trigger.click();
    await expect(page.getByText(/substitui o rascunho atual/)).toBeVisible();
    await replace.click();
    await expect(page.getByLabel("Objetivo")).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-ai-generator-diet-mobile.png",
      fullPage: true,
    });
  });
});
