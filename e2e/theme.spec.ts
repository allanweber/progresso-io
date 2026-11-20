import { expect, test, type Page } from "@playwright/test";

const COACH_STORAGE = "e2e/.auth/coach.json";
const ALUNO_STORAGE = "e2e/.auth/aluno.json";
const NIGHT_BACKGROUND = "rgb(25, 23, 22)";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("progresso-cookie-consent", "accepted"),
  );
});

async function isDark(page: Page) {
  return page.evaluate(() => document.documentElement.classList.contains("dark"));
}

async function whiteSurfaces(page: Page, scope: string) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return ["missing scope"];
    return Array.from(root.querySelectorAll<HTMLElement>("*"))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 20 || rect.height <= 20) return false;
        const bg = getComputedStyle(el).backgroundColor;
        const match = bg.match(/^rgba?\(255, 255, 255(?:, ([\d.]+))?\)$/);
        return match !== null && Number(match[1] ?? 1) >= 0.5;
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 120));
  }, scope);
}

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
}

test.describe("theme · coach", () => {
  test.use({ storageState: COACH_STORAGE });

  test("follows the system, then keeps an explicit choice across reloads", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/coach");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await isDark(page)).toBe(true);
    await expect(page.locator("body")).toHaveCSS("background-color", NIGHT_BACKGROUND);

    await page.getByTestId("theme-toggle").click();
    await page.getByRole("radio", { name: "Claro" }).click();
    expect(await isDark(page)).toBe(false);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await isDark(page)).toBe(false);
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute(
      "aria-label",
      "Tema: Claro",
    );

    await page.emulateMedia({ colorScheme: "light" });
    await page.getByTestId("theme-toggle").click();
    await page.getByRole("radio", { name: "Escuro" }).click();
    expect(await isDark(page)).toBe(true);
    await page.reload();
    expect(await isDark(page)).toBe(true);

    await page.getByTestId("theme-toggle").click();
    await page.getByRole("radio", { name: "Automático" }).click();
    expect(await isDark(page)).toBe(false);
  });

  test("paints coach screens on night surfaces, never on white", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const screens: [string, string][] = [
      ["/coach", "dashboard"],
      ["/coach/students", "students"],
      ["/coach/library/foods", "foods"],
      ["/coach/workouts", "workouts"],
      ["/coach/settings", "settings"],
    ];
    for (const [path, name] of screens) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await whiteSurfaces(page, "#conteudo"), path).toEqual([]);
      await shoot(page, `theme-dark-${name}-desktop`);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await whiteSurfaces(page, "#conteudo"), path).toEqual([]);
      await shoot(page, `theme-dark-${name}-mobile`);
    }

    await page.getByRole("button", { name: "Abrir menu" }).click();
    const drawerTheme = page.getByRole("radiogroup", { name: "Tema" });
    await expect(drawerTheme).toBeVisible();
    await expect(drawerTheme.getByRole("radio", { name: "Automático" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await shoot(page, "theme-dark-drawer-mobile");
  });
});

test.describe("theme · aluno", () => {
  test.use({ storageState: ALUNO_STORAGE });

  test("paints the aluno portal on night surfaces", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/student");
    await expect(page.getByRole("button", { name: /Tema:/ }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await isDark(page)).toBe(true);
    expect(await whiteSurfaces(page, "main")).toEqual([]);
    await shoot(page, "theme-dark-student-desktop");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/student");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("theme-toggle").last()).toBeVisible();
    expect(await whiteSurfaces(page, "main")).toEqual([]);
    await shoot(page, "theme-dark-student-mobile");
  });
});

test.describe("theme · public", () => {
  test("paints sign-in and the landing page on night surfaces", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    for (const [path, name] of [
      ["/login", "login"],
      ["/", "landing"],
    ]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await isDark(page)).toBe(true);
      await expect(page.locator("body")).toHaveCSS("background-color", NIGHT_BACKGROUND);
      expect(await whiteSurfaces(page, "body")).toEqual([]);
      if (name === "landing") await expect(page.getByTestId("theme-toggle")).toBeVisible();
      await shoot(page, `theme-dark-${name}-desktop`);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (name === "landing") {
        const toggle = page.getByTestId("theme-toggle");
        await expect(toggle).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await toggle.click();
        await page.getByRole("radio", { name: "Claro" }).click();
        expect(await isDark(page)).toBe(false);
        await page.getByRole("radio", { name: "Escuro" }).click();
        expect(await isDark(page)).toBe(true);
        await page.keyboard.press("Escape");
      }
      await shoot(page, `theme-dark-${name}-mobile`);
    }
  });
});
