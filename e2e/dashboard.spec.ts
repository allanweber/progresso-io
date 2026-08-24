import { expect, test } from "@playwright/test";

/**
 * The coach dashboard ("Sua fila de hoje"). Runs in the `coach` project against
 * the seeded coach's session + the real DB.
 *
 * The screen is one ranked queue: check-ins, WhatsApp, plan-less alunos and
 * unpublished drafts merged and sorted by how long each has waited. This spec
 * asserts that merge (a fresh plan-less aluno turns into a queue row that links
 * to the task), the today-only agenda, and the mobile promise the screen makes —
 * that the fila is reachable without scrolling past a wall of tiles. Desktop and
 * mobile screenshots fall out of those assertions (see the screenshots rule in
 * AGENTS.md).
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

test.describe("coach dashboard", () => {
  test("merges every backlog into one ranked queue and links each row to its task", async ({
    page,
  }) => {
    // A fresh online student with no diet/workout becomes a deterministic
    // `missing-plan` row in the queue.
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

    await expect(
      page.getByRole("heading", { name: "Sua fila de hoje" }),
    ).toBeVisible();

    const queue = page.getByRole("region", { name: "Precisa de você" });
    await expect(queue).toBeVisible();

    // The queue ranks oldest-wait-first and shows a handful, so a just-created
    // aluno sorts last. Expand when the overflow control is offered.
    const seeAll = queue.getByRole("button", { name: /^Ver todos \(\d+\)$/ });
    if (await seeAll.isVisible().catch(() => false)) await seeAll.click();

    // The merge: a plan-less aluno is a queue row, tagged by kind in words (not
    // colour alone), carrying what is actually missing.
    const row = queue.getByRole("listitem").filter({ hasText: `${first} Teste` });
    await expect(row).toBeVisible();
    await expect(row.getByText("sem treino e dieta")).toBeVisible();
    await expect(row.getByText("sem plano", { exact: true })).toBeVisible();
    // Created moments ago, so its wait reads as today rather than a day count.
    await expect(row.getByText("hoje", { exact: true })).toBeVisible();
    // Rows go to the task/record, never to an index the coach must search.
    await expect(row.getByRole("link")).toHaveAttribute(
      "href",
      `/coach/students/${studentId}`,
    );

    // Today's agenda is a supporting card; the week lives on the calendar page.
    await expect(
      page.getByRole("heading", { name: "Agenda de hoje" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "ver agenda" })).toHaveAttribute(
      "href",
      "/coach/calendar",
    );
    // The removed sections must stay removed.
    await expect(
      page.getByRole("heading", { name: "Esta semana", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("Em breve")).toHaveCount(0);

    await page.screenshot({
      path: "test-results/screens/coach-dashboard-desktop.png",
      fullPage: true,
    });

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/coach");

    const queueHeading = page.getByRole("heading", { name: "Precisa de você" });
    await expect(queueHeading).toBeVisible();

    // The screen is called "sua fila de hoje"; on a phone the fila must be on
    // screen without scrolling. The old tile row pushed it ~420px down.
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

  test("survives a failed load without reporting an empty queue", async ({
    page,
  }) => {
    // The P0 this redesign fixed: a failed fetch used to fall through to the
    // zero/empty branches, so a coach on bad signal read "nothing pending".
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

    // Nothing may claim the queue is clear while the load is broken.
    await expect(page.getByText("Tudo em dia")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Precisa de você" })).toHaveCount(
      0,
    );

    // The header keeps its escape hatches so the coach is never stranded.
    await expect(
      page.getByRole("heading", { name: "Sua fila de hoje" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ver todos os alunos" }),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-dashboard-error.png",
      fullPage: true,
    });
  });
});
