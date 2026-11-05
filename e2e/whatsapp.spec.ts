import { expect, test } from "@playwright/test";

test.describe("coach whatsapp inbox", () => {
  test("prepares, opens and dismisses messages, both viewports", async ({
    page,
    context,
  }) => {
    const openedText = `Boa, Ana! ${Date.now().toString().slice(-5)}`;
    const dismissedText = `Descartar ${Date.now().toString().slice(-5)}`;

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/coach/whatsapp");

    const cookieAccept = page.getByRole("button", { name: "Aceitar" });
    if (await cookieAccept.isVisible().catch(() => false)) {
      await cookieAccept.click();
    }

    await expect(
      page.getByRole("heading", { name: "WhatsApp", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("wa-handoff-banner")).toBeVisible();

    await expect(page.getByTestId("wa-coming-soon-banner")).toContainText(
      "em desenvolvimento",
    );
    await expect(page.getByTestId("wa-conversation")).toHaveCount(0);
    await expect(page.getByTestId("wa-window-badge")).toHaveCount(0);

    const student = page.getByTestId("wa-student");
    await student.selectOption({ label: "Ana Aluna" });
    const composer = page.getByTestId("wa-composer-text");
    await composer.fill(openedText);
    await page.getByTestId("wa-send").click();

    const queue = page.getByTestId("wa-queue");
    const openedItem = queue
      .getByTestId("wa-queue-item")
      .filter({ hasText: openedText });
    await expect(openedItem).toBeVisible();

    const link = openedItem.getByTestId("wa-queue-open");
    const href = await link.getAttribute("href");
    const url = new URL(href!);
    expect(url.origin + url.pathname).toBe("https://web.whatsapp.com/send");
    expect(url.searchParams.get("phone")).toBe("5511999990000");
    expect(url.searchParams.get("text")).toBe(openedText);

    await page.screenshot({
      path: "test-results/screens/coach-whatsapp-desktop.png",
      fullPage: true,
    });

    await context.route("https://web.whatsapp.com/**", (route) =>
      route.fulfill({ status: 200, body: "whatsapp" }),
    );
    const popupPromise = context.waitForEvent("page");
    await link.click();
    const popup = await popupPromise;
    await popup.close();

    await expect(openedItem).toHaveCount(0);
    await expect(
      page.getByTestId("wa-recent-item").filter({ hasText: openedText }),
    ).toBeVisible();

    await composer.fill(dismissedText);
    await page.getByTestId("wa-send").click();
    const dismissedItem = queue
      .getByTestId("wa-queue-item")
      .filter({ hasText: dismissedText });
    await expect(dismissedItem).toBeVisible();
    await dismissedItem.getByTestId("wa-queue-dismiss").click();
    await expect(dismissedItem).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/coach/whatsapp");
    await expect(
      page.getByRole("heading", { name: "WhatsApp", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("wa-handoff-banner")).toBeVisible();
    await expect(page.getByTestId("wa-queue")).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-whatsapp-mobile.png",
      fullPage: true,
    });
  });
});
