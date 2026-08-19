import { expect, test } from "@playwright/test";

/**
 * The platform-admin WhatsApp overview. Runs in the `admin` project against the
 * seeded admin's session + the real DB. Asserts the KPI header and the
 * per-tenant connection table (the seeded coach clinic shows "conectado"), and
 * captures the desktop + mobile screenshots.
 */
test.describe("admin whatsapp overview", () => {
  test("renders per-tenant connections + KPIs, both viewports", async ({
    page,
  }) => {
    // --- Desktop ---
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/whatsapp");

    await expect(page.getByRole("heading", { name: "WhatsApp", exact: true })).toBeVisible();
    await expect(page.getByText("Conectados")).toBeVisible();
    await expect(
      page.getByText("Conexões WhatsApp por tenant"),
    ).toBeVisible();
    // The seeded coach clinic has a connected connection.
    await expect(page.getByText("conectado").first()).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/admin-whatsapp-desktop.png",
      fullPage: true,
    });

    // --- Mobile ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/whatsapp");
    await expect(page.getByRole("heading", { name: "WhatsApp", exact: true })).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/admin-whatsapp-mobile.png",
      fullPage: true,
    });
  });
});
