import { expect, test } from "@playwright/test";

import { expectNoMessage, waitForMessage } from "./outbox";

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
    const phone = uniquePhone();

    await page.goto("/coach/students/new");
    await page.getByLabel("Nome", { exact: true }).fill("Carla");
    await page.getByLabel("Sobrenome").fill("Convidada");
    await page.getByLabel("WhatsApp").fill(phone);
    await page.getByLabel("E-mail", { exact: true }).fill(email);

    // Wait for the anamnese select to settle before submitting. It is left at
    // its default here, but that default is applied ASYNCHRONOUSLY — the form
    // picks the first template only once the templates query resolves. Submit
    // before that and `anamnesisId` is still "", which makes the API skip the
    // WhatsApp fill link entirely (`modality === "online" && data.anamnesisId`)
    // while still creating the student and navigating. The registration looks
    // completely successful and no message is ever sent.
    await expect(page.locator("#anamnesisId")).not.toHaveText(
      /Carregando|Nenhuma/,
    );

    await page.getByRole("button", { name: "Enviar convite" }).click();
    await page.waitForURL(/\/coach\/students\/[0-9a-f-]{36}$/);

    // Registration sends the anamnese fill link — NOT the portal invite yet.
    // Scoped to this aluno: the outbox is shared with every other spec running
    // in parallel (see e2e/outbox.ts). Keyed by PHONE, because the fill link
    // goes out as a WhatsApp template; the portal invite below is the e-mail.
    await waitForMessage(request, phone, "anamnesis_fill");
    // Both channels: `sendPortalInvite` captures kind "invite" for the WhatsApp
    // template AND the e-mail, so checking only one would miss half of what
    // this assertion exists to rule out.
    await expectNoMessage(request, phone, "invite");
    await expectNoMessage(request, email, "invite");

    // Portal access is sent on the first diet/workout published, or on demand via
    // the profile's "Enviar convite" button — used here to get the invite link.
    await page.getByRole("button", { name: "Enviar convite" }).click();
    await expect(page.getByText(/Convite enviado por WhatsApp/)).toBeVisible();

    const invite = await waitForMessage(request, email, "invite");
    expect(invite.url).toBeTruthy();

    const alunoContext = await browser.newContext();
    try {
      const alunoPage = await alunoContext.newPage();
      await alunoPage.goto(invite.url!);
      await expect(
        alunoPage.getByRole("heading", { name: "Ative seu acesso" }),
      ).toBeVisible();
      await alunoPage.getByLabel("Senha", { exact: true }).fill("alunosenha123");
      await alunoPage.getByLabel("Confirmar senha").fill("alunosenha123");
      await alunoPage.getByRole("button", { name: "Ativar acesso" }).click();
      // The invite lands on the clinic's OWN portal (…/<slug>/invite/accept),
      // so activation returns the aluno to that clinic's branded login — never
      // the canonical /login, which would drop them out of the address they
      // were invited to. Read the slug off the invite rather than hard-coding
      // the seeded one.
      const slug = new URL(invite.url!).pathname.split("/")[1];
      await alunoPage.waitForURL(
        new RegExp(`/${slug}/entrar\\?activated=1`),
      );
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
    // exact: the dashboard header has a "Ver todos os alunos" link too, so match
    // only the sidebar's "Alunos" nav link (hidden until the drawer opens).
    await expect(
      page.getByRole("link", { name: "Alunos", exact: true }),
    ).toBeHidden();

    await page.getByRole("button", { name: "Abrir menu" }).click();

    const drawer = page.getByRole("dialog", { name: "Menu de navegação" });
    const alunos = drawer.getByRole("link", { name: "Alunos" });
    await expect(alunos).toBeVisible();

    await alunos.click();
    await expect(page).toHaveURL(/\/coach\/students/);
  });
});

/**
 * Back is how a phone dismisses anything covering the screen. It used to unwind
 * the router instead, so backing out of a modal cost the coach the page behind
 * it — see `useModalHistory` in src/lib/modal-history.ts.
 */
test.describe("voltar no celular fecha o modal", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // The cookie banner is a fixed bottom bar that covers the form's submit
  // button on a 390px screen. Pre-accept it, as the dashboard spec does.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("progresso-cookie-consent", "accepted"),
    );
  });

  test("fecha o menu lateral sem sair da página", async ({ page }) => {
    await page.goto("/coach");
    await page.goto("/coach/students");

    await page.getByRole("button", { name: "Abrir menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(drawer).toBeVisible();

    await page.goBack();

    await expect(drawer).toBeHidden();
    // The drawer ate the Back press; the roster is still on screen.
    await expect(page).toHaveURL(/\/coach\/students$/);
    await expect(
      page.getByRole("heading", { name: "Alunos", exact: true }),
    ).toBeVisible();
  });

  test("um link do menu navega uma vez, e voltar desfaz uma vez", async ({
    page,
  }) => {
    await page.goto("/coach");

    await page.getByRole("button", { name: "Abrir menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu de navegação" });
    await drawer.getByRole("link", { name: "Alunos" }).click();

    // The drawer gives its history entry back *before* the router pushes, so
    // the tap moves (it used to land on an entry about to be popped, and read
    // as a dead link)…
    await expect(page).toHaveURL(/\/coach\/students$/);
    await expect(drawer).toBeHidden();

    // …and leaves no spare entry behind: one Back, one step.
    await page.goBack();
    await expect(page).toHaveURL(/\/coach$/);
  });

  test("fecha um modal sem sair da tela do aluno", async ({ page }) => {
    await page.goto("/coach/students/new");
    await page.getByLabel("Nome", { exact: true }).fill("Voltar");
    await page.getByLabel("Sobrenome").fill("Teste");
    await page.getByLabel("WhatsApp").fill(uniquePhone());
    await page.getByLabel("E-mail", { exact: true }).fill(uniqueEmail("voltar"));
    await page.getByRole("button", { name: "Enviar convite" }).click();
    await page.waitForURL(/\/coach\/students\/[0-9a-f-]{36}$/);
    const studentUrl = page.url();

    // The anamnese card offers the same picker either way — "Atribuir" when the
    // aluno has none yet, "Trocar template" when the invite already assigned one.
    await page
      .getByRole("button", { name: /Atribuir anamnese|Trocar template/ })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.goBack();

    await expect(dialog).toBeHidden();
    // Without this, Back would have returned to /coach/students/new.
    expect(page.url()).toBe(studentUrl);
    await expect(
      page.getByRole("heading", { name: "Anamnese" }),
    ).toBeVisible();

    // And with the modal gone, Back is the ordinary one again.
    await page.goBack();
    await expect(page).toHaveURL(/\/coach\/students\/new$/);
  });
});
