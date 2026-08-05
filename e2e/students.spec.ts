import { expect, test } from "@playwright/test";

/**
 * Authenticated coach flows against the real DB (see scripts/e2e.mjs). Runs in
 * the `coach` project, which reuses the seeded coach's saved session.
 */

/** A unique e-mail so parallel runs never collide on the clinic's unique index. */
function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test.describe("student management", () => {
  test("shows the roster with the seeded student", async ({ page }) => {
    await page.goto("/coach/students");
    await expect(page.getByRole("heading", { name: "Alunos" })).toBeVisible();
    await expect(page.getByText("Ana Aluna")).toBeVisible();
  });

  test("blocks an invalid create and stays on the form", async ({ page }) => {
    await page.goto("/coach/students/new");
    await page.getByRole("button", { name: "Adicionar aluno" }).click();
    await expect(page.getByText("Informe o nome.")).toBeVisible();
    await expect(page.getByText("Informe o sobrenome.")).toBeVisible();
    await expect(page).toHaveURL(/\/coach\/students\/new$/);
  });

  test("adds a student and lands on the profile", async ({ page }) => {
    const email = uniqueEmail("novo");
    await page.goto("/coach/students/new");
    await page.getByLabel("Nome", { exact: true }).fill("Bruno");
    await page.getByLabel("Sobrenome").fill("Teste");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Objetivo (opcional)").fill("Emagrecimento");
    await page.getByRole("button", { name: "Adicionar aluno" }).click();

    await page.waitForURL(/\/coach\/students\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Bruno Teste" })).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible();
    // Newly created, no login yet.
    await expect(page.getByText("Offline")).toBeVisible();
  });

  test("invites a student and the aluno activates their login", async ({
    page,
    request,
    browser,
  }) => {
    const email = uniqueEmail("convidado");

    // Create the student.
    await page.goto("/coach/students/new");
    await page.getByLabel("Nome", { exact: true }).fill("Carla");
    await page.getByLabel("Sobrenome").fill("Convidada");
    await page.getByLabel("E-mail").fill(email);
    await page.getByRole("button", { name: "Adicionar aluno" }).click();
    await page.waitForURL(/\/coach\/students\/[0-9a-f-]{36}$/);

    // Isolate the outbox, then send the invite from the profile.
    await request.delete("/api/test/outbox");
    await page.getByRole("button", { name: "Convidar" }).click();
    await expect(
      page.getByText(`Convite enviado para ${email}`),
    ).toBeVisible();

    // Recover the emailed accept link from the test outbox.
    const res = await request.get("/api/test/outbox");
    const { messages } = (await res.json()) as {
      messages: { to: string; kind: string; url?: string }[];
    };
    const invite = messages.find((m) => m.to === email && m.kind === "invite");
    expect(invite?.url).toBeTruthy();

    // A fresh, unauthenticated context is the aluno accepting the invite.
    const alunoContext = await browser.newContext();
    try {
      const alunoPage = await alunoContext.newPage();
      await alunoPage.goto(invite!.url!);
      await expect(
        alunoPage.getByRole("heading", { name: "Ative seu acesso" }),
      ).toBeVisible();
      await alunoPage.getByLabel("Senha", { exact: true }).fill("alunosenha123");
      await alunoPage.getByLabel("Confirmar senha").fill("alunosenha123");
      await alunoPage.getByRole("button", { name: "Ativar acesso" }).click();

      await alunoPage.waitForURL("**/student");
      await expect(alunoPage).toHaveURL(/\/student/);
    } finally {
      await alunoContext.close();
    }

    // Back on the coach side, the student now shows portal access.
    await page.reload();
    await expect(page.getByText("Portal")).toBeVisible();
  });
});
