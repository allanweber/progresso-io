import { expect, test } from "@playwright/test";

/**
 * Authenticated coach flows against the real DB (see scripts/e2e.mjs). Runs in
 * the `coach` project, which reuses the seeded coach's saved session. Covers the
 * merged registration screen (create + assign anamnese + send/fill).
 */

/** Unique identifiers so parallel runs never collide on the clinic's uniques. */
function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}
function uniquePhone(): string {
  const n = Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, "0");
  return `11 9${n.slice(0, 4)}-${n.slice(4)}`;
}

test.describe("student management", () => {
  test("shows the roster with the seeded student", async ({ page }) => {
    await page.goto("/coach/students");
    await expect(page.getByRole("heading", { name: "Alunos" })).toBeVisible();
    await expect(page.getByRole("table").getByText("Ana Aluna")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("listitem").getByText("Ana Aluna"),
    ).toBeVisible();
  });

  test("blocks an invalid registration and stays on the form", async ({ page }) => {
    await page.goto("/coach/students/new");
    await page.getByRole("button", { name: "Enviar convite" }).click();
    await expect(page.getByText("Informe o nome.")).toBeVisible();
    await expect(page.getByText("Informe o sobrenome.")).toBeVisible();
    await expect(page).toHaveURL(/\/coach\/students\/new$/);
  });

  test("registers an online student and lands on the profile", async ({ page }) => {
    const email = uniqueEmail("novo");
    await page.goto("/coach/students/new");
    await page.getByLabel("Nome", { exact: true }).fill("Bruno");
    await page.getByLabel("Sobrenome").fill("Teste");
    await page.getByLabel("WhatsApp").fill(uniquePhone());
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Objetivo (opcional)").fill("Emagrecimento");
    // Access defaults to online → the submit is "Enviar convite".
    await page.getByRole("button", { name: "Enviar convite" }).click();

    await page.waitForURL(/\/coach\/students\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Bruno Teste" })).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible();
  });

  test("registers an offline student and goes straight to filling the anamnese", async ({
    page,
  }) => {
    await page.goto("/coach/students/new");
    await page.getByLabel("Nome", { exact: true }).fill("Otavio");
    await page.getByLabel("Sobrenome").fill("Offline");
    await page.getByLabel("WhatsApp").fill(uniquePhone());
    await page.getByRole("button", { name: /Offline \/ presencial/ }).click();
    // Now the submit reads "Registrar aluno".
    await page.getByRole("button", { name: "Registrar aluno" }).click();

    // Lands on the coach fill page for that student's anamnese.
    await page.waitForURL(/\/coach\/students\/[0-9a-f-]{36}\/anamnesis$/);
    await expect(
      page.getByRole("button", { name: "Salvar anamnese" }),
    ).toBeVisible();
  });

  test("registers an online student; the aluno activates via the invite link", async ({
    page,
    request,
    browser,
  }) => {
    const email = uniqueEmail("convidado");
    await request.delete("/api/test/outbox");

    await page.goto("/coach/students/new");
    await page.getByLabel("Nome", { exact: true }).fill("Carla");
    await page.getByLabel("Sobrenome").fill("Convidada");
    await page.getByLabel("WhatsApp").fill(uniquePhone());
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Enviar convite" }).click();
    await page.waitForURL(/\/coach\/students\/[0-9a-f-]{36}$/);

    // Registration sent the portal access link (captured for the email channel).
    const { messages } = (await (await request.get("/api/test/outbox")).json()) as {
      messages: { to: string; kind: string; url?: string }[];
    };
    const invite = messages.find((m) => m.to === email && m.kind === "invite");
    expect(invite?.url).toBeTruthy();

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
      await alunoPage.waitForURL(/\/login\?activated=1/);
    } finally {
      await alunoContext.close();
    }

    await page.reload();
    await expect(page.getByText("Portal").first()).toBeVisible();
  });
});

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("opens the side nav from the header drawer", async ({ page }) => {
    await page.goto("/coach");
    await expect(page.getByRole("link", { name: "Alunos" })).toBeHidden();

    await page.getByRole("button", { name: "Abrir menu" }).click();

    const drawer = page.getByRole("dialog", { name: "Menu de navegação" });
    const alunos = drawer.getByRole("link", { name: "Alunos" });
    await expect(alunos).toBeVisible();

    await alunos.click();
    await expect(page).toHaveURL(/\/coach\/students/);
  });
});
