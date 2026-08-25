import { expect, test } from "@playwright/test";

/**
 * Authenticated coach anamnesis (anamnese) flows against the real DB (see
 * scripts/e2e.mjs). Runs in the `anamneses` project, reusing the seeded coach's
 * saved session. The coach's clinic gets its starter set of anamneses from the
 * seed, so the listing is populated.
 */

// Pre-accept the cookie banner: it is pinned to the bottom of the viewport with
// role="dialog" and intercepted the click on "Montar uma anamnese do zero".
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("progresso-cookie-consent", "accepted"),
  );
});

test.describe("anamneses", () => {
  test("the clinic starts with its seeded anamneses", async ({ page }) => {
    const res = await page.request.get("/api/anamneses?pageSize=100");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { total: number };
    // The starter set (>= 5) was copied into the clinic at seed time.
    expect(body.total).toBeGreaterThanOrEqual(5);
  });

  test("duplicates an anamnese with a (cópia) suffix and lands on the copy", async ({
    page,
  }) => {
    // A source anamnese via the authenticated API (same coach session).
    const res = await page.request.post("/api/anamneses", {
      data: {
        name: "Anamnese base",
        description: "Para duplicar",
        objective: "health",
        modality: "any",
        sections: [
          {
            key: "s1",
            title: "Identificação",
            questions: [{ key: "q1", type: "short_text", label: "Nome" }],
          },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();
    const { anamnesis } = (await res.json()) as { anamnesis: { id: string } };

    await page.goto(`/coach/anamneses/${anamnesis.id}`);
    await expect(
      page.getByRole("heading", { name: "Anamnese base" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Duplicar" }).click();
    await page.waitForURL(
      (url) =>
        /\/coach\/anamneses\/[^/]+$/.test(url.pathname) &&
        !url.pathname.endsWith(anamnesis.id),
    );
    const copyId = page.url().split("/").pop()!;

    const copy = await page.request.get(`/api/anamneses/${copyId}`);
    expect(copy.ok()).toBeTruthy();
    const copyBody = (await copy.json()) as { name: string; sections: unknown[] };
    expect(copyBody.name).toBe("Anamnese base (cópia)");
    expect(copyBody.sections).toHaveLength(1);
  });

  test("builds a new anamnese through the builder and saves it", async ({
    page,
  }) => {
    await page.goto("/coach/anamneses/new");

    // The clinic is seeded with starter templates, so "Nova anamnese" opens on
    // the copy-a-template chooser; the blank builder is behind its escape.
    await page
      .getByRole("button", { name: "Montar uma anamnese do zero" })
      .click();

    await page
      .getByLabel("Nome da anamnese")
      .fill("Anamnese de teste e2e");
    await page.getByRole("button", { name: "Adicionar seção" }).click();
    await page
      .getByPlaceholder("Título da seção (ex.: Identificação)")
      .fill("Bloco 1");
    await page.getByRole("button", { name: "Adicionar pergunta" }).click();
    await page.getByPlaceholder("Texto da pergunta").fill("Qual seu objetivo?");

    await page.getByRole("button", { name: "Salvar anamnese" }).click();

    // Lands on the new anamnese's detail page.
    await page.waitForURL(/\/coach\/anamneses\/[^/]+$/);
    await expect(
      page.getByRole("heading", { name: "Anamnese de teste e2e" }),
    ).toBeVisible();
    await expect(page.getByText("Bloco 1")).toBeVisible();
    await expect(page.getByText("Qual seu objetivo?")).toBeVisible();
  });

  test("captures coach anamnesis screens (desktop + mobile)", async ({
    page,
  }) => {
    // List — wait for the seeded rows to load before capturing.
    await page.goto("/coach/anamneses");
    await expect(
      page.getByRole("heading", { name: "Anamneses", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Carregando anamneses…")).toBeHidden();
    // Desktop: the table cell for a seeded anamnese is visible.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(
      page.getByRole("cell", { name: "Anamnese — Emagrecimento (online)" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-anamneses-list-desktop.png",
      fullPage: true,
    });
    // Mobile: the card (a link) for a seeded anamnese is visible.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("link", { name: /Anamnese — Emagrecimento \(online\)/ }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-anamneses-list-mobile.png",
      fullPage: true,
    });

    // Detail of the seeded online weight-loss anamnese.
    await page.setViewportSize({ width: 1280, height: 900 });
    const list = await page.request.get("/api/anamneses?pageSize=100");
    const body = (await list.json()) as {
      items: { id: string; name: string }[];
    };
    const online =
      body.items.find((i) => i.name.toLowerCase().includes("online")) ??
      body.items[0];
    await page.goto(`/coach/anamneses/${online.id}`);
    await expect(
      page.getByRole("heading", { name: online.name }),
    ).toBeVisible();
    // The read view shows section headings and question-type chips.
    await expect(page.getByText("Identificação").first()).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-anamnesis-detail-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/screens/coach-anamnesis-detail-mobile.png",
      fullPage: true,
    });
  });
});
