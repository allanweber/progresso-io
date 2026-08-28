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

test.describe("diet builder", () => {
  test("duplicates a meal with all its data, below the original", async ({
    page,
  }) => {
    // Two real catalog foods, so the duplicate carries a genuine item + sub.
    const catalog = await page.request.get("/api/foods?pageSize=2");
    expect(catalog.ok()).toBeTruthy();
    const { items } = (await catalog.json()) as {
      items: { id: string; description: string }[];
    };
    expect(items.length).toBeGreaterThanOrEqual(2);
    const [food, substitute] = items;

    const res = await page.request.post("/api/diets", {
      data: {
        name: "Base semanal",
        notes: "",
        meals: [
          { name: "Café da manhã", time: "08:00", items: [] },
          {
            name: "Almoço",
            time: "12:00",
            items: [
              {
                foodId: food.id,
                grams: 120,
                measureLabel: "escumadeira",
                measureGrams: 60,
                substitutes: [
                  {
                    foodId: substitute.id,
                    grams: 150,
                    measureLabel: null,
                    measureGrams: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();
    const { diet } = (await res.json()) as { diet: { id: string } };

    await page.goto(`/coach/diets/${diet.id}/edit`);
    // Both seeded meals rendered ⇒ the builder hydrated (the tree renders only
    // after mount, to keep @dnd-kit out of the SSR markup).
    const names = page.locator('input[placeholder="Nome da refeição"]');
    await expect(names).toHaveCount(2, { timeout: 20000 });

    // Duplicate → the copy lands directly BELOW its original, with the food
    // and the substitution already in it.
    await page.getByRole("button", { name: "Duplicar refeição Almoço" }).click();
    await expect(names).toHaveCount(3);
    await expect(names.nth(0)).toHaveValue("Café da manhã");
    await expect(names.nth(1)).toHaveValue("Almoço");
    await expect(names.nth(2)).toHaveValue("Almoço (cópia)");
    // Both the original and the copy list the food.
    await expect(page.getByText(food.description)).toHaveCount(2);

    // The copy is a normal meal — rename it and save.
    await names.nth(2).fill("Jantar");
    await page.getByRole("button", { name: "Salvar dieta" }).click();
    await page.waitForURL(`**/coach/diets/${diet.id}`);

    // Assert through the API: three meals, the copy in position, carrying the
    // item, its medida caseira and its substitution.
    const saved = await page.request.get(`/api/diets/${diet.id}`);
    expect(saved.ok()).toBeTruthy();
    const body = (await saved.json()) as {
      meals: {
        name: string;
        time: string | null;
        items: {
          foodId: string;
          grams: number;
          measureLabel: string | null;
          substitutes: { foodId: string }[];
        }[];
      }[];
    };
    expect(body.meals.map((m) => m.name)).toEqual([
      "Café da manhã",
      "Almoço",
      "Jantar",
    ]);
    const copy = body.meals[2];
    expect(copy.time).toBe("12:00");
    expect(copy.items).toHaveLength(1);
    expect(copy.items[0]).toMatchObject({
      foodId: food.id,
      grams: 120,
      measureLabel: "escumadeira",
    });
    expect(copy.items[0].substitutes).toHaveLength(1);
    expect(copy.items[0].substitutes[0].foodId).toBe(substitute.id);
  });
});
