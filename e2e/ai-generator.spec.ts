import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The AI program generator's entry point, on the seeded coach's session and the
 * real DB (see scripts/e2e.mjs).
 *
 * No LLM is configured in the e2e environment and none should be — a spec must
 * not depend on a paid third party being reachable, and a model's output isn't
 * assertable anyway. What IS assertable, and what these tests cover, is
 * everything around the call: the gate that decides whether a coach may press
 * the button, the questions each dialog asks — treino and dieta ask different
 * ones — and the fact that an unconfigured install refuses in plain PT-BR
 * instead of failing opaquely.
 *
 * The generation itself is covered by `tests/ai-generator.integration.test.ts`
 * against a fake provider.
 */

type StudentList = { students: { id: string; firstName: string }[] };

async function anaId(request: APIRequestContext): Promise<string> {
  const { students } = (await (
    await request.get("/api/students")
  ).json()) as StudentList;
  const ana = students.find((s) => s.firstName === "Ana");
  expect(ana, "the seeded aluno with a completed anamnese").toBeTruthy();
  return ana!.id;
}

test.describe("ai program generator", () => {
  test("offers the generator on Treino, asks only the treino questions, refuses without a provider (desktop + mobile)", async ({
    page,
    request,
  }) => {
    await page.goto(`/coach/students/${await anaId(request)}/workout`);

    const trigger = page.getByRole("button", { name: "Gerar treino com IA" });
    await expect(trigger).toBeEnabled();
    await trigger.click();

    // Ana already has a published workout, so the first screen is the overwrite
    // gate — it must name what is lost, not just ask "tem certeza?".
    const replace = page.getByRole("button", { name: "Substituir rascunho" });
    if (await replace.isVisible()) {
      await expect(page.getByText(/substitui o rascunho atual/)).toBeVisible();
      await replace.click();
    }

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

    // No LLM configured → a named refusal in PT-BR, inside the dialog.
    await submit.click();
    await expect(
      page.getByText("A geração por IA ainda não está configurada nesta instalação."),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel("Objetivo")).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-ai-generator-mobile.png",
      fullPage: true,
    });
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
    await page.goto(`/coach/students/${await anaId(request)}/diet`);

    const trigger = page.getByRole("button", { name: "Gerar dieta com IA" });
    await expect(trigger).toBeEnabled();
    await trigger.click();

    const replace = page.getByRole("button", { name: "Substituir rascunho" });
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

    // Same refusal path as Treino: no provider configured in e2e.
    await submit.click();
    await expect(
      page.getByText("A geração por IA ainda não está configurada nesta instalação."),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel("Objetivo")).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-ai-generator-diet-mobile.png",
      fullPage: true,
    });
  });
});
