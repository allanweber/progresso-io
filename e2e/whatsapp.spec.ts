import { expect, test } from "@playwright/test";

/**
 * The coach WhatsApp inbox. Runs in the `coach` project against the seeded
 * coach's session (Clínica plan → WhatsApp enabled) + the real DB. Asserts the
 * seeded conversations, an open-window free-text send round-trip, the
 * closed-window template fallback, and captures the desktop + mobile screenshots
 * as a byproduct (see the screenshots rule in AGENTS.md).
 */
test.describe("coach whatsapp inbox", () => {
  // The dev server compiles /coach/whatsapp on first hit; give it room.
  test.setTimeout(120_000);

  test("open-window send, closed-window templates, both viewports", async ({
    page,
  }) => {
    const reply = `Boa, Ana! ${Date.now().toString().slice(-5)}`;

    // --- Desktop ---
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/coach/whatsapp");

    // Dismiss the cookie banner — it's pinned to the bottom and would otherwise
    // intercept clicks on the composer's send button.
    const cookieAccept = page.getByRole("button", { name: "Aceitar" });
    if (await cookieAccept.isVisible().catch(() => false)) {
      await cookieAccept.click();
    }

    await expect(
      page.getByRole("heading", { name: "WhatsApp", exact: true }),
    ).toBeVisible();

    // Explicitly open the seeded aluno's OPEN-window thread. Don't rely on it
    // being the auto-selected (newest) conversation: event automations
    // (diet/workout published, check-in feedback) can append template-only
    // threads that sort ahead of it. Its window stays open regardless — a
    // template send never touches `lastInboundAt`.
    await page.getByText("Ana Aluna").first().click();

    await expect(page.getByTestId("wa-window-badge")).toBeVisible();
    const composer = page.getByTestId("wa-composer-text");
    await expect(composer).toBeVisible();
    await composer.fill(reply);
    // Send with Enter rather than the send button: the button sits at the
    // bottom edge where the (async) cookie banner can still intercept a click.
    await composer.press("Enter");
    // The sent text lands in the thread (and the list preview) — first() is enough.
    await expect(page.getByText(reply).first()).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-whatsapp-desktop.png",
      fullPage: true,
    });

    // The seeded CLOSED-window conversation → the template-only composer.
    await page.getByText("Claro! Consigo terça").click();
    await expect(page.getByTestId("wa-closed-banner")).toBeVisible();
    await expect(page.getByTestId("wa-template").first()).toBeVisible();

    // --- Mobile: list first, then tap into a thread ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/coach/whatsapp");
    await expect(
      page.getByRole("heading", { name: "WhatsApp", exact: true }),
    ).toBeVisible();
    await page.getByText("Ana Aluna").first().click();
    await expect(page.getByTestId("wa-window-badge")).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-whatsapp-mobile.png",
      fullPage: true,
    });
  });
});
