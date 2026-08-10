import { expect, test } from "@playwright/test";

/**
 * Student-anamnese + notification flows against the real DB (see scripts/e2e.mjs).
 * Runs in the `student-anamneses` project on the seeded coach's session. The
 * seed gives the aluno (Ana) a completed anamnese + a clinic notification, so the
 * profile cards and the bell have content.
 */

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}
function uniquePhone(): string {
  const n = Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, "0");
  return `11 9${n.slice(0, 4)}-${n.slice(4)}`;
}

type StudentList = { students: { id: string; firstName: string }[] };
type AnamnesisItems = { items: { id: string; name: string }[] };

/**
 * A stable system starter. Every starter carries a date-masked "Data de
 * nascimento"; a coach-authored template (created by the concurrent `anamneses`
 * project, most-recent-first ⇒ items[0]) may not — so mask tests select a
 * starter by name instead of trusting list order.
 */
const STARTER_WITH_DATE_MASK = "Anamnese — Emagrecimento (online)";

async function pickDateMaskedAnamnesisId(
  request: import("@playwright/test").APIRequestContext,
): Promise<string> {
  const { items } = (await (
    await request.get("/api/anamneses?pageSize=100")
  ).json()) as AnamnesisItems;
  const starter =
    items.find((i) => i.name === STARTER_WITH_DATE_MASK) ?? items[0];
  expect(starter, "a seeded starter anamnese").toBeTruthy();
  return starter.id;
}

async function anaId(request: import("@playwright/test").APIRequestContext) {
  const { students } = (await (await request.get("/api/students")).json()) as StudentList;
  const ana = students.find((s) => s.firstName === "Ana");
  expect(ana).toBeTruthy();
  return ana!.id;
}

test.describe("student anamneses", () => {
  test("the seeded aluno profile shows Perfil metrics + a filled anamnese", async ({
    page,
    request,
  }) => {
    await page.goto(`/coach/students/${await anaId(request)}`);
    await expect(page.getByRole("heading", { name: "Ana Aluna" })).toBeVisible();

    // Perfil metrics were extracted from the anamnese answers.
    await expect(page.getByText("Peso atual")).toBeVisible();
    await expect(page.getByText("71,4")).toBeVisible();
    // The anamnese was filled by the aluno.
    await expect(page.getByText("Preenchida pelo aluno")).toBeVisible();
  });

  test("online fill: wrong number is rejected, the right one submits + notifies", async ({
    request,
    browser,
  }) => {
    const { items } = (await (
      await request.get("/api/anamneses?pageSize=100")
    ).json()) as { items: { id: string }[] };
    const phone = uniquePhone();

    await request.delete("/api/test/outbox");
    const reg = await request.post("/api/students", {
      data: {
        firstName: "Public",
        lastName: "Fill",
        phone,
        email: uniqueEmail("pf"),
        goal: "",
        modality: "online",
        anamnesisId: items[0].id,
      },
    });
    expect(reg.ok()).toBeTruthy();

    const { messages } = (await (
      await request.get("/api/test/outbox")
    ).json()) as { messages: { kind: string; url?: string }[] };
    const fill = messages.find((m) => m.kind === "anamnesis_fill");
    expect(fill?.url).toBeTruthy();

    const ctx = await browser.newContext();
    try {
      const p = await ctx.newPage();
      await p.goto(fill!.url!);
      await expect(p.getByLabel("Seu WhatsApp")).toBeVisible();

      // Wrong number → rejected.
      await p.getByLabel("Seu WhatsApp").fill("11 00000-0000");
      await p.getByRole("button", { name: "Enviar anamnese" }).click();
      await expect(p.getByText(/não confere/)).toBeVisible();

      // Correct number → submitted.
      await p.getByLabel("Seu WhatsApp").fill(phone);
      await p.getByRole("button", { name: "Enviar anamnese" }).click();
      await expect(p.getByText("Anamnese enviada!")).toBeVisible();
    } finally {
      await ctx.close();
    }

    // The clinic's bell now has an unread notification.
    const notifs = (await (await request.get("/api/notifications")).json()) as {
      unread: number;
    };
    expect(notifs.unread).toBeGreaterThanOrEqual(1);
  });

  test("a duplicate e-mail shows under the E-mail field, not just a banner", async ({
    page,
  }) => {
    await page.goto("/coach/students/new");
    await page.getByLabel("Nome", { exact: true }).fill("Dup");
    await page.getByLabel("Sobrenome").fill("Email");
    await page.getByLabel("WhatsApp").fill(uniquePhone());
    await page.getByLabel("E-mail", { exact: true }).fill("aluno@progresso.io");
    // Wait for the anamnese default so the client-side form is submittable.
    await expect(page.locator("#anamnesisId")).toContainText("Anamnese");
    await page.getByRole("button", { name: "Enviar convite" }).click();

    // The conflict renders in the E-mail field's inline error slot (#email-error),
    // not only in the top banner.
    await expect(page.locator("#email-error")).toHaveText(
      "Já existe um aluno com este e-mail.",
    );
  });

  test("the fill page blocks an invalid masked value (date)", async ({
    request,
    browser,
  }) => {
    // Pick a starter (date-masked) rather than items[0], which the concurrent
    // `anamneses` project can turn into a maskless coach template.
    const anamnesisId = await pickDateMaskedAnamnesisId(request);
    const phone = uniquePhone();

    await request.delete("/api/test/outbox");
    const reg = await request.post("/api/students", {
      data: {
        firstName: "Mask",
        lastName: "Date",
        phone,
        email: uniqueEmail("mask"),
        goal: "",
        modality: "online",
        anamnesisId,
      },
    });
    expect(reg.ok()).toBeTruthy();
    const { messages } = (await (
      await request.get("/api/test/outbox")
    ).json()) as { messages: { kind: string; url?: string }[] };
    const fill = messages.find((m) => m.kind === "anamnesis_fill");
    expect(fill?.url).toBeTruthy();

    const ctx = await browser.newContext();
    try {
      const p = await ctx.newPage();
      await p.goto(fill!.url!);
      await p.getByLabel("Seu WhatsApp").fill(phone);
      // Every starter template asks 'Data de nascimento' with a date mask; a
      // malformed value is blocked with the format message.
      await p.getByLabel("Data de nascimento").fill("31-02-2020");
      await p.getByRole("button", { name: "Enviar anamnese" }).click();

      await expect(
        p.getByText("Informe uma data válida (dd/mm/aaaa)."),
      ).toBeVisible();
      await expect(p.getByText("Anamnese enviada!")).toBeHidden();
    } finally {
      await ctx.close();
    }
  });

  test("captures the anamnese + notification screens (desktop + mobile)", async ({
    page,
    request,
  }) => {
    // Registration screen.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/coach/students/new");
    await expect(
      page.getByRole("heading", { name: "Convidar novo aluno" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-register-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/screens/coach-register-mobile.png",
      fullPage: true,
    });

    // Profile — Dados & anamnese.
    const id = await anaId(request);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/coach/students/${id}`);
    await expect(page.getByText("Preenchida pelo aluno")).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-student-anamnese-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/screens/coach-student-anamnese-mobile.png",
      fullPage: true,
    });

    // Notification bell (opened).
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/coach");
    await page.getByRole("button", { name: /Notificações/ }).click();
    await expect(
      page.getByText("Notificações", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-notifications-desktop.png",
    });

    // Public fill page.
    const { items } = (await (
      await request.get("/api/anamneses?pageSize=100")
    ).json()) as { items: { id: string }[] };
    await request.delete("/api/test/outbox");
    await request.post("/api/students", {
      data: {
        firstName: "Shot",
        lastName: "Fill",
        phone: uniquePhone(),
        email: uniqueEmail("shot"),
        goal: "",
        modality: "online",
        anamnesisId: items[0].id,
      },
    });
    const { messages } = (await (
      await request.get("/api/test/outbox")
    ).json()) as { messages: { kind: string; url?: string }[] };
    const fill = messages.find((m) => m.kind === "anamnesis_fill");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(fill!.url!);
    await expect(page.getByLabel("Seu WhatsApp")).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/anamnese-fill-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/screens/anamnese-fill-mobile.png",
      fullPage: true,
    });
  });
});
