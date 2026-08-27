import { expect, test } from "@playwright/test";

/**
 * The platform-admin AI overview. Runs in the `admin` project against the seeded
 * admin's session + the real DB.
 *
 * The seed writes four demo generations for the demo coach clinic — one cold
 * (all input billed fresh), two warm (prefix served from cache) and one failed.
 * That mix is deliberate: it is exactly the set of cases the screen has to
 * render honestly, and the assertions below check each.
 *
 * The seed also enters a price for the demo model, so the Custo column shows a
 * real figure rather than dashes.
 *
 * The e2e environment has no LLM configured, so the "not configured" banner is
 * asserted too — an all-zero table would otherwise be ambiguous.
 *
 * The demo clinic's row is found by its "corrigida" marker, **not** by name: the
 * `coach` project runs concurrently and `settings.spec.ts` renames that clinic
 * mid-run. It is the only clinic the seed gives a server-corrected generation
 * to.
 */
test.describe("admin ai overview", () => {
  test("renders KPIs and per-tenant usage (desktop + mobile)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/ai");

    await expect(
      page.getByRole("heading", { name: "IA", exact: true }),
    ).toBeVisible();

    // No provider configured in e2e → the banner has to say so, otherwise an
    // empty table reads as "nobody used it".
    await expect(
      page.getByText(/Nenhum provedor de IA configurado/),
    ).toBeVisible();

    // KPI header.
    await expect(page.getByText("Gerações no mês")).toBeVisible();
    await expect(page.getByText("Taxa de cache")).toBeVisible();
    await expect(page.getByText("Custo no mês")).toBeVisible();
    await expect(page.getByText("No limite")).toBeVisible();

    await expect(page.getByText("Uso de IA por tenant")).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "corrigida" });
    await expect(row).toHaveCount(1);

    // 3 of the seed's 4 rows are billed — the failed one is free, which is the
    // whole point of settling failures as `failed` rather than `succeeded`.
    await expect(row).toContainText("3 / 25");
    // 1 failure, shown next to the 2 successes.
    await expect(row).toContainText("2");

    // Cache hit rate: 31.200 of 49.210 input tokens came back cached → 63%.
    // Asserting the exact figure is the point — a plausible-looking wrong
    // percentage is precisely the failure this screen exists to catch.
    await expect(row).toContainText("63%");

    // Priced against the seeded provider_price row: 18.010 fresh input @
    // $0.03/M + 31.200 cached @ $0.003/M + 9.350 output @ $0.13/M = 1.849 µUSD.
    // Every demo row is covered by that price, so nothing reads as "parcial".
    await expect(row).toContainText("US$ 0,001849");
    await expect(row).not.toContainText("parcial");

    await page.screenshot({
      path: "test-results/screens/admin-ai-desktop.png",
      fullPage: true,
    });

    // --- Mobile: the table scrolls inside its own container, the page doesn't ---
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Gerações no mês")).toBeVisible();
    const noPageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(noPageOverflow, "page must not scroll horizontally on mobile").toBe(
      true,
    );

    await page.screenshot({
      path: "test-results/screens/admin-ai-mobile.png",
      fullPage: true,
    });
  });

  test("models: rolls the month up by model, with the active config (desktop + mobile)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/ai");
    await page.getByRole("tab", { name: "Modelos" }).click();

    // The model form, prefilled from the server's own settings so the screen can
    // never show a value the generator isn't actually using.
    await expect(page.getByText("Modelo em uso")).toBeVisible();
    await expect(page.getByLabel("Modelo principal")).toHaveValue(
      "qwen/qwen3.7-flash:floor",
    );
    // Nothing has been saved in e2e, so it has to say these are the defaults
    // rather than letting them read as a decision someone made.
    await expect(page.getByText(/Ainda no padrão do sistema/)).toBeVisible();

    await expect(page.getByText("Uso por modelo")).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "seed-demo" });
    await expect(row).toHaveCount(1);

    // Both hosts the seed routed to, alphabetical. The whole reason the column
    // exists: one slug, two hosts, two prices.
    await expect(row).toContainText("Alibaba, Groq");

    // All four seeded rows, including the failure — unlike the per-tenant
    // table, this one is not about credits, so a failure still counts as a call
    // that was made.
    await expect(row).toContainText("4");
    await expect(row).toContainText("1 falhas");

    // 1 repair over 3 successes.
    await expect(row).toContainText("33%");
    // Same cache figure as the tenant table, from the same rows.
    await expect(row).toContainText("63%");

    // Total, and the per-call figure. 1.849 µUSD over the THREE rows that
    // actually cost something — the failed row spent nothing and must not
    // dilute the average into 462.
    await expect(row).toContainText("US$ 0,001849");
    await expect(row).toContainText("US$ 0,000616");
    // Nothing was reported by a provider (the seed predates the switch by
    // construction), so every figure here is priced off the Preços tab.
    await expect(row).toContainText("estimado");

    await page.screenshot({
      path: "test-results/screens/admin-ai-models-desktop.png",
      fullPage: true,
    });

    // --- Mobile: the wide table scrolls in its own container, not the page ---
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Uso por modelo")).toBeVisible();
    const noPageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(noPageOverflow, "page must not scroll horizontally on mobile").toBe(
      true,
    );

    await page.screenshot({
      path: "test-results/screens/admin-ai-models-mobile.png",
      fullPage: true,
    });
  });

  test("prices: create, edit and delete a price, repricing the usage table", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/ai");
    await page.getByRole("tab", { name: "Preços" }).click();

    // The seeded demo price is listed.
    await expect(page.getByText("seed-demo").first()).toBeVisible();

    // --- Create -------------------------------------------------------------
    const model = `e2e-model-${Date.now()}`;
    await page.getByRole("button", { name: "Novo preço" }).click();
    // `exact` is load-bearing: getByLabel substring-matches, and the page also
    // has a **Modelos** tab whose panel is labelled by its trigger, so a bare
    // "Modelo" resolves to two elements and fails strict mode.
    await page.getByLabel("Modelo", { exact: true }).fill(model);
    await page.getByLabel("Vigente desde").fill("2026-01-01T00:00");
    // pt-BR comma decimals: what an admin actually types off a vendor page.
    await page.getByLabel("Entrada", { exact: true }).fill("0,03");
    await page.getByLabel("Saída", { exact: true }).fill("0,13");
    await page.getByLabel("Fonte (opcional)").fill("Página do provedor");
    await page.getByRole("button", { name: "Salvar" }).click();

    const row = page.getByRole("row").filter({ hasText: model });
    await expect(row).toBeVisible();
    await expect(row).toContainText("US$ 0,03");
    // Cache left blank → billed as normal input, and the table says so rather
    // than showing a misleading zero.
    await expect(row).toContainText("= entrada");

    await page.screenshot({
      path: "test-results/screens/admin-ai-prices-desktop.png",
      fullPage: true,
    });

    // --- Duplicate is refused on the date field -----------------------------
    await page.getByRole("button", { name: "Novo preço" }).click();
    await page.getByLabel("Modelo", { exact: true }).fill(model);
    await page.getByLabel("Vigente desde").fill("2026-01-01T00:00");
    await page.getByLabel("Entrada", { exact: true }).fill("0,05");
    await page.getByLabel("Saída", { exact: true }).fill("0,15");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(
      page.getByText("Já existe um preço para este modelo nesta data."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();

    // --- Edit ---------------------------------------------------------------
    await row.getByRole("button", { name: `Editar preço de ${model}` }).click();
    await page.getByLabel("Entrada", { exact: true }).fill("0,08");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(row).toContainText("US$ 0,08");

    // --- Delete -------------------------------------------------------------
    await row.getByRole("button", { name: `Remover preço de ${model}` }).click();
    await expect(page.getByText(/voltam a aparecer como/)).toBeVisible();
    await page.getByRole("button", { name: "Remover" }).click();
    await expect(page.getByRole("row").filter({ hasText: model })).toHaveCount(0);
  });

  test("is reachable from the admin nav", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/students");
    await page.getByRole("link", { name: "IA", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/ai$/);
    await expect(page.getByText("Uso de IA por tenant")).toBeVisible();
  });
});
