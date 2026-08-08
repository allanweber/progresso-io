import { expect, test } from "@playwright/test";

/**
 * Authenticated coach diet flows against the real DB (see scripts/e2e.mjs).
 * Runs in the `diets` project, reusing the seeded coach's saved session.
 */

test.describe("diet copy", () => {
  test("copies a diet with a (cópia) suffix and lands on the copy", async ({
    page,
  }) => {
    // Create a source diet via the authenticated API (same coach session).
    const res = await page.request.post("/api/diets", {
      data: {
        name: "Cutting 1800",
        notes: "Beber 3L de água por dia.",
        meals: [
          { name: "Café da manhã", time: "08:00", items: [] },
          { name: "Almoço", time: "12:00", items: [] },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();
    const { diet } = (await res.json()) as { diet: { id: string } };

    await page.goto(`/coach/diets/${diet.id}`);
    // Heading visible ⇒ the client page has hydrated, so the click will register.
    await expect(
      page.getByRole("heading", { name: "Cutting 1800" }),
    ).toBeVisible();

    // Copy → the coach is routed to the fresh copy (a different diet id).
    await page.getByRole("button", { name: "Criar cópia" }).click();
    await page.waitForURL(
      (url) => /\/coach\/diets\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith(diet.id),
    );
    const copyId = page.url().split("/").pop()!;

    // Assert the copy via the API (no second page render to race a cold compile):
    // an exact copy named "<name> (cópia)".
    const copy = await page.request.get(`/api/diets/${copyId}`);
    expect(copy.ok()).toBeTruthy();
    const copyBody = (await copy.json()) as { name: string; meals: unknown[] };
    expect(copyBody.name).toBe("Cutting 1800 (cópia)");
    expect(copyBody.meals).toHaveLength(2);
  });
});
