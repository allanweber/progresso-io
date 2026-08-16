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
 * The e2e environment has no LLM configured, so the "not configured" banner is
 * asserted too — an all-zero table would otherwise be ambiguous.
 *
 * The demo clinic's row is found by its "reparo" marker, **not** by name: the
 * `coach` project runs concurrently and `settings.spec.ts` renames that clinic
 * mid-run. It is the only clinic the seed gives a repaired generation to.
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
    await expect(page.getByText("Tokens no mês")).toBeVisible();
    await expect(page.getByText("No limite")).toBeVisible();

    await expect(page.getByText("Uso de IA por tenant")).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "reparo" });
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

  test("is reachable from the admin nav", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/students");
    await page.getByRole("link", { name: "IA", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/ai$/);
    await expect(page.getByText("Uso de IA por tenant")).toBeVisible();
  });
});
