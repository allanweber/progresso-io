import { expect, test } from "@playwright/test";

/**
 * The redesigned coach dashboard ("Sua fila de hoje"). Runs in the `coach`
 * project against the seeded coach's session + the real DB. Asserts the real,
 * data-backed cards (active count + "sem treino ou dieta" list + the "Hoje" /
 * "Esta semana" calendar agenda) and the remaining coming-soon section, and
 * captures the desktop + mobile screenshots as a byproduct (see the screenshots
 * rule in AGENTS.md).
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
  test("shows real + coming-soon sections and lists plan-less students", async ({
    page,
  }) => {
    // Register a fresh online student (no diet/workout yet) so the "Sem treino
    // ou dieta" list has a deterministic row to assert + screenshot.
    const first = `Semplano${Date.now().toString().slice(-6)}`;
    await page.goto("/coach/students/new");
    await page.getByLabel("Nome", { exact: true }).fill(first);
    await page.getByLabel("Sobrenome").fill("Teste");
    await page.getByLabel("WhatsApp").fill(uniquePhone());
    await page.getByLabel("E-mail", { exact: true }).fill(uniqueEmail("semplano"));
    await page.getByRole("button", { name: "Enviar convite" }).click();
    await page.waitForURL(/\/coach\/students\/[0-9a-f-]{36}$/);

    // --- Desktop ---
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/coach");

    await expect(
      page.getByRole("heading", { name: "Sua fila de hoje" }),
    ).toBeVisible();
    await expect(page.getByText("Alunos ativos")).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Check-ins aguardando resposta" }),
    ).toBeVisible();
    // The "Peso destoando da meta" section is still a coming-soon body.
    await expect(
      page.getByRole("heading", { name: "Peso destoando da meta" }),
    ).toBeVisible();
    await expect(page.getByText("Em breve").first()).toBeVisible();

    // The calendar agenda cards render (from the seeded events); their "Ver
    // agenda" shortcut links to the full calendar.
    await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Esta semana" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ver agenda" }),
    ).toHaveAttribute("href", "/coach/calendar");

    // The one real list surfaces the plan-less student with both badges. Scope
    // to this student's row — parallel tests add other plan-less students, so a
    // bare "sem treino" would match several badges.
    await expect(
      page.getByRole("heading", { name: "Sem treino ou dieta" }),
    ).toBeVisible();
    const row = page
      .getByRole("listitem")
      .filter({ hasText: `${first} Teste` });
    await expect(row).toBeVisible();
    await expect(row.getByText("sem treino", { exact: true })).toBeVisible();
    await expect(row.getByText("sem dieta", { exact: true })).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-dashboard-desktop.png",
      fullPage: true,
    });

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("heading", { name: "Sua fila de hoje" }),
    ).toBeVisible();
    await expect(page.getByText(`${first} Teste`)).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-dashboard-mobile.png",
      fullPage: true,
    });
  });
});
