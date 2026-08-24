import { expect, test } from "@playwright/test";

/**
 * The coach dashboard ("Sua fila de hoje"). Runs in the `coach` project against
 * the seeded coach's session + the real DB.
 *
 * The screen is four counted KPI tiles over per-channel cards. This spec asserts
 * that a fresh plan-less aluno moves *both* halves in step — the "Sem
 * treino/dieta" tile and the "Sem treino ou dieta" card, whose row links to the
 * aluno — plus the agenda pair, the drafts card, and the error state. Desktop
 * and mobile screenshots fall out of those assertions (see the screenshots rule
 * in AGENTS.md).
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

/**
 * The screenshots are the deliverable here, and the app-wide cookie banner is a
 * fixed bottom bar that covered the lowest cards on mobile. Pre-accept it in
 * localStorage — the pattern the admin specs already use — so every capture
 * shows the screen, not the consent strip.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("progresso-cookie-consent", "accepted"),
  );
});

test.describe("coach dashboard", () => {
  test("counts each backlog in a tile and lists it in its own card", async ({
    page,
  }) => {
    // A fresh online student with no diet/workout is a deterministic row in the
    // "Sem treino ou dieta" card and a deterministic +1 on its tile.
    const first = `Semplano${Date.now().toString().slice(-6)}`;
    await page.goto("/coach/students/new");
    await page.getByLabel("Nome", { exact: true }).fill(first);
    await page.getByLabel("Sobrenome").fill("Teste");
    await page.getByLabel("WhatsApp").fill(uniquePhone());
    await page.getByLabel("E-mail", { exact: true }).fill(uniqueEmail("semplano"));
    await page.getByRole("button", { name: "Enviar convite" }).click();
    await page.waitForURL(/\/coach\/students\/[0-9a-f-]{36}$/);
    const studentId = page.url().split("/").pop()!;

    // --- Desktop ---
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/coach");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: "Sua fila de hoje" }),
    ).toBeVisible();

    // All four tiles are always present, whatever their counts — a bold 0 is
    // itself the answer, and the row must not reflow between loads.
    for (const label of [
      "Alunos ativos",
      "Sem treino/dieta",
      "Check-ins pendentes",
      "WhatsApp aguardando",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    // The plan cap rides along under the roster count.
    await expect(page.getByText(/plano \w+/i).first()).toBeVisible();

    // The card and its tile agree: the aluno we just created is in the list,
    // and the tile counts at least that one.
    const missing = page.getByRole("region", { name: "Sem treino ou dieta" });
    await expect(missing).toBeVisible();
    const row = missing.getByRole("listitem").filter({ hasText: `${first} Teste` });
    await expect(row).toBeVisible();
    // Kind is named in words, never encoded by colour alone.
    await expect(row.getByText("sem treino")).toBeVisible();
    await expect(row.getByText("sem dieta")).toBeVisible();
    await expect(row.getByRole("link")).toHaveAttribute(
      "href",
      `/coach/students/${studentId}`,
    );
    expect(
      Number(await page.locator("#kpi-sem-treino-dieta").innerText()),
    ).toBeGreaterThanOrEqual(1);

    // Check-ins are their own card and go straight to the feedback task.
    const checkins = page.getByRole("region", {
      name: "Check-ins aguardando resposta",
    });
    await expect(checkins).toBeVisible();
    const checkinRow = checkins.getByRole("listitem").first();
    await expect(checkinRow.getByText("responder")).toBeVisible();
    await expect(checkinRow.getByRole("link")).toHaveAttribute(
      "href",
      /\/coach\/students\/[0-9a-f-]{36}\/feedback$/,
    );

    // Unpublished drafts get their own card: invisible to the aluno, so nothing
    // else in the product nags about them.
    await expect(
      page.getByRole("region", { name: "Rascunhos não publicados" }),
    ).toBeVisible();

    // Both agenda cards are back — today, and the rest of the week.
    await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Esta semana", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver agenda" })).toHaveAttribute(
      "href",
      "/coach/calendar",
    );

    // WhatsApp waiting is its own card and deep-links into the conversation.
    const wa = page.getByRole("region", { name: "WhatsApp aguardando" });
    await expect(wa).toBeVisible();
    await expect(wa.getByRole("listitem").first().getByRole("link")).toHaveAttribute(
      "href",
      /\/coach\/whatsapp\?c=/,
    );

    // The "Peso destoando da meta" placeholder stays retired: no card on this
    // screen may promise a feature that does not exist yet.
    await expect(page.getByText("Em breve")).toHaveCount(0);

    await page.screenshot({
      path: "test-results/screens/coach-dashboard-desktop.png",
      fullPage: true,
    });

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/coach");
    await page.waitForLoadState("networkidle");

    // The tiles stay 2-up rather than stacking into a 4-tall column that would
    // bury every card below the fold.
    const activeTile = page.getByText("Alunos ativos", { exact: true });
    const checkinTile = page.getByText("Check-ins pendentes", { exact: true });
    const activeBox = await activeTile.boundingBox();
    const checkinBox = await checkinTile.boundingBox();
    expect(activeBox).not.toBeNull();
    expect(checkinBox).not.toBeNull();
    // Two rows of two: the third tile sits below the first, not beside it.
    expect(checkinBox!.y).toBeGreaterThan(activeBox!.y);

    // The first card is reachable in roughly one swipe, not buried.
    const firstCard = page.getByRole("heading", {
      name: "Check-ins aguardando resposta",
    });
    await expect(firstCard).toBeVisible();
    const cardBox = await firstCard.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.y).toBeLessThan(844 * 1.5);

    // Real rows, not skeletons.
    await expect(
      page
        .getByRole("region", { name: "Sem treino ou dieta" })
        .getByRole("listitem")
        .first(),
    ).toBeVisible();

    // The screen is called "sua fila de hoje"; on a phone the title must be on
    // screen without scrolling — banner, tiles and actions included.
    const queueHeading = page.getByRole("heading", {
      name: "Sua fila de hoje",
    });
    const box = await queueHeading.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(844);

    // The page must not scroll sideways on a phone. It used to, by 37px: the
    // triage columns are grid items, which default to `min-width: auto`, and
    // every row inside them carries a `truncate` (i.e. `white-space: nowrap`)
    // line — so a long message preview or a phone number set the column's
    // minimum to its own full width and pushed the cards past the viewport.
    // Half of every badge on the right-hand edge was unreachable, and the
    // marketing screenshot cut through it mid-word.
    const [viewportWidth, scrollWidth] = await page.evaluate(() => [
      document.documentElement.clientWidth,
      document.documentElement.scrollWidth,
    ]);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth);

    await page.screenshot({
      path: "test-results/screens/coach-dashboard-mobile.png",
      fullPage: true,
    });
  });

  test("survives a failed load without reporting an empty dashboard", async ({
    page,
  }) => {
    // The P0 this fixed: a failed fetch used to fall through to the zero/empty
    // branches, so a coach on bad signal read "nothing pending" and stopped.
    await page.route("**/api/coach/dashboard", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Falha ao carregar o painel." }),
      }),
    );
    await page.goto("/coach");

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(
      alert.getByRole("heading", { name: "Não foi possível carregar seu painel" }),
    ).toBeVisible();
    await expect(alert.getByText("Falha ao carregar o painel.")).toBeVisible();
    await expect(
      alert.getByRole("button", { name: "Tentar de novo" }),
    ).toBeVisible();

    // No tile may show a reassuring 0 and no card may claim to be clear while
    // the load is broken.
    await expect(page.getByText("Alunos ativos", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Check-ins aguardando resposta" }),
    ).toHaveCount(0);
    await expect(page.getByText(/Nenhum check-in aguardando/)).toHaveCount(0);

    // The header keeps its escape hatches so the coach is never stranded.
    await expect(
      page.getByRole("heading", { name: "Sua fila de hoje" }),
    ).toBeVisible();
    // Desktop viewport, so the secondary action is visible; on a phone the
    // drawer carries it instead.
    await expect(
      page.getByRole("link", { name: "Ver todos os alunos" }),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-dashboard-error.png",
      fullPage: true,
    });
  });
});
