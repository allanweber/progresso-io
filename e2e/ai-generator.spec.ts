import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The AI program generator's entry point, on the seeded coach's session and the
 * real DB (see scripts/e2e.mjs).
 *
 * No LLM is configured in the e2e environment and none should be — a spec must
 * not depend on a paid third party being reachable, and a model's output isn't
 * assertable anyway. What IS assertable, and what these tests cover, is
 * everything around the call: the gate that decides whether a coach may press
 * the button, the four questions the dialog asks, and the fact that an
 * unconfigured install refuses in plain PT-BR instead of failing opaquely.
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
  test("offers the generator on Treino, asks the four questions, refuses without a provider (desktop + mobile)", async ({
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

    // The four inputs the coach answers, per docs/ai-generator.md.
    await expect(page.getByLabel("Objetivo")).toBeVisible();
    await expect(page.getByText("Equipamentos disponíveis")).toBeVisible();
    await expect(page.getByText("Restrições alimentares")).toBeVisible();
    await expect(page.getByLabel("Dias por semana")).toHaveValue("3");

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

  test("the Dieta tab offers the same generator", async ({ page, request }) => {
    await page.goto(`/coach/students/${await anaId(request)}/diet`);
    await expect(
      page.getByRole("button", { name: "Gerar dieta com IA" }),
    ).toBeEnabled();
  });
});
