import { expect, test } from "@playwright/test";

/**
 * Authenticated coach workout (treino) flows against the real DB (see
 * scripts/e2e.mjs). Runs in the `workouts` project, reusing the seeded coach's
 * saved session.
 */

test.describe("workout copy", () => {
  test("copies a workout with a (cópia) suffix and lands on the copy", async ({
    page,
  }) => {
    // Create a source workout via the authenticated API (same coach session).
    const res = await page.request.post("/api/workouts", {
      data: {
        name: "Full body 3x",
        notes: null,
        sessions: [
          { name: "Ficha A", exercises: [] },
          { name: "Ficha B", exercises: [] },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();
    const { workout } = (await res.json()) as { workout: { id: string } };

    await page.goto(`/coach/workouts/${workout.id}`);
    await expect(
      page.getByRole("heading", { name: "Full body 3x" }),
    ).toBeVisible();

    // Copy → the coach is routed to the fresh copy (a different workout id).
    await page.getByRole("button", { name: "Criar cópia" }).click();
    await page.waitForURL(
      (url) =>
        /\/coach\/workouts\/[^/]+$/.test(url.pathname) &&
        !url.pathname.endsWith(workout.id),
    );
    const copyId = page.url().split("/").pop()!;

    // Assert the copy via the API: an exact copy named "<name> (cópia)".
    const copy = await page.request.get(`/api/workouts/${copyId}`);
    expect(copy.ok()).toBeTruthy();
    const copyBody = (await copy.json()) as {
      name: string;
      sessions: unknown[];
    };
    expect(copyBody.name).toBe("Full body 3x (cópia)");
    expect(copyBody.sessions).toHaveLength(2);
  });

  test("captures coach workout screens with all techniques (desktop + mobile)", async ({
    page,
  }) => {
    // The exercise-image host (R2 / CDN) isn't reachable from the e2e browser,
    // so fulfil image requests with a stand-in so the detail's media area
    // renders (production serves the real catalog photos from R2).
    await page.route(/\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i, (route) => {
      // Distinguish the two catalog frames (…/0.jpg vs …/1.jpg) so the detail's
      // image carousel shows visibly different slides between prev/next.
      const url = route.request().url();
      const second = /1\.(png|jpe?g|webp|gif|avif)/i.test(url);
      const from = second ? "#0f172a" : "#334155";
      const to = second ? "#1e293b" : "#0f172a";
      const label = second ? "Posição final" : "Posição inicial";
      route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><text x="50%" y="50%" fill="#94a3b8" font-family="sans-serif" font-size="15" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`,
      });
    });

    const ex = async (q: string): Promise<string | null> => {
      const r = await page.request.get(
        `/api/exercises?search=${encodeURIComponent(q)}&pageSize=1`,
      );
      const j = (await r.json()) as { items: { id: string }[] };
      return j.items[0]?.id ?? null;
    };
    const [
      supino,
      crucifixo,
      triceps,
      remada,
      puxada,
      rosca,
      desenvolvimento,
      abdominal,
      agacha,
      legpress,
      cadeira,
    ] = await Promise.all([
      ex("supino"),
      ex("crucifixo"),
      ex("triceps"),
      ex("remada"),
      ex("puxada"),
      ex("rosca"),
      ex("desenvolvimento"),
      ex("abdominal"),
      ex("agachamento"),
      ex("leg press"),
      ex("cadeira"),
    ]);

    const item = (id: string | null, o: Record<string, unknown>) =>
      id
        ? {
            exerciseId: id,
            load: null,
            technique: null,
            groupId: null,
            customSubstitutes: [],
            ...o,
          }
        : null;
    const nn = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);
    const range = (...values: number[]) => ({ kind: "range", values });

    const res = await page.request.post("/api/workouts", {
      data: {
        name: "Programa completo — técnicas",
        notes: "Demonstra todas as técnicas avançadas.",
        sessions: [
          {
            name: "Ficha A · Peito e Tríceps",
            exercises: nn([
              item(supino, {
                sets: 4,
                reps: range(8, 10),
                rest: 90,
                load: "40 kg",
                technique: "dropset",
                customSubstitutes: crucifixo
                  ? [{ exerciseId: crucifixo, note: "ombro sensível" }]
                  : [],
              }),
              // A super set authored the intuitive way: only the FIRST item
              // carries the technique; it chains (no rest) into the next, which
              // is the block's tail (no technique, same groupId).
              item(crucifixo, {
                sets: 3,
                reps: range(10, 12),
                rest: 30,
                technique: "superset",
                groupId: "ssA",
              }),
              item(triceps, {
                sets: 3,
                reps: range(12, 15),
                rest: 60,
                groupId: "ssA",
              }),
            ]),
          },
          {
            name: "Ficha B · Costas, Bíceps e Ombros",
            exercises: nn([
              item(remada, { sets: 4, reps: range(8, 10), rest: 20, technique: "giant", groupId: "gtB" }),
              item(puxada, { sets: 4, reps: range(8, 10), rest: 20, technique: "giant", groupId: "gtB" }),
              item(rosca, { sets: 3, reps: range(10, 12), rest: 60, technique: "giant", groupId: "gtB" }),
              item(desenvolvimento, { sets: 4, reps: range(10, 12), rest: 75, technique: "cluster" }),
              item(abdominal, { sets: 3, reps: { kind: "failure" }, rest: 45, technique: "tripledrop" }),
            ]),
          },
          {
            name: "Ficha C · Pernas",
            exercises: nn([
              item(agacha, { sets: 10, reps: { kind: "fixed", value: 10 }, rest: 60, load: "60 kg", technique: "gvt" }),
              item(legpress, { sets: 7, reps: range(10, 12), rest: 30, technique: "fs7" }),
              item(cadeira, { sets: 3, reps: range(12, 15), rest: 45, technique: "restpause" }),
            ]),
          },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();
    const { workout } = (await res.json()) as { workout: { id: string } };

    // --- Workouts list (desktop + mobile) ---
    await page.goto("/coach/workouts");
    // Dismiss the app-wide cookie banner — it carries role="dialog", which would
    // otherwise collide with the exercise-detail dialog locator below.
    await page.getByRole("button", { name: "Aceitar" }).click();
    await expect(page.getByRole("heading", { name: "Treinos" })).toBeVisible();
    await expect(page.getByText("Programa completo — técnicas")).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-workouts-list-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/screens/coach-workouts-list-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });

    // --- Workout detail (desktop) — the continuous super/giant rail + badges ---
    await page.goto(`/coach/workouts/${workout.id}`);
    await expect(
      page.getByRole("heading", { name: /Programa completo/ }),
    ).toBeVisible();
    await expect(page.getByText(/Giant set/).first()).toBeVisible();
    // The super set was authored by marking only the first item, yet chains into
    // the next: the block spans both exercises (its opener labels it).
    await expect(page.getByText(/Super set · 2 em sequência/)).toBeVisible();
    await expect(page.getByText(/substituiç/).first()).toBeVisible(); // the count indicator
    await page.screenshot({
      path: "test-results/screens/coach-workout-detail-desktop.png",
      fullPage: true,
    });

    // Exercise detail dialog (desktop) — the full substitution list lives here.
    await page.getByText(/Drop set/).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Técnica: Drop set/)).toBeVisible();
    await expect(dialog.getByText(/Substituições/)).toBeVisible();
    // The image carousel: two frames with prev/next controls.
    await expect(dialog.getByRole("button", { name: "Próxima imagem" })).toBeVisible();
    await dialog.screenshot({
      path: "test-results/screens/coach-exercise-detail-desktop.png",
    });
    // Advance the carousel to the second frame.
    await dialog.getByRole("button", { name: "Próxima imagem" }).click();
    await expect(dialog.getByRole("button", { name: "Imagem anterior" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // --- Workout detail + exercise detail (mobile) ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/coach/workouts/${workout.id}`);
    await expect(
      page.getByRole("heading", { name: /Programa completo/ }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-workout-detail-mobile.png",
      fullPage: true,
    });
    await page.getByText(/Drop set/).first().click();
    await expect(dialog).toBeVisible();
    await dialog.screenshot({
      path: "test-results/screens/coach-exercise-detail-mobile.png",
    });
  });
});

test.describe("workout builder", () => {
  test("prescribes an exercise at insertion — steppers + Pirâmide reps (desktop + mobile)", async ({
    page,
  }) => {
    // The exercise-image host isn't reachable from the e2e browser; fulfil image
    // requests so search rows and the panel render instead of hanging.
    await page.route(/\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i, (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#334155"/></svg>`,
      }),
    );

    await page.goto("/coach/workouts/new");
    await page.getByRole("button", { name: "Aceitar" }).click();

    await page
      .getByPlaceholder("Ex.: Hipertrofia · 4x semana")
      .fill("Treino pirâmide");

    // Add a ficha, then open the exercise picker.
    await page.getByRole("button", { name: "Nova ficha" }).click();
    await page
      .getByPlaceholder(/Nome da ficha/)
      .fill("Ficha A · Pernas");
    await page.getByRole("button", { name: "Adicionar exercício" }).click();

    // Search and select an exercise → the full prescription panel opens.
    await page
      .getByPlaceholder(/Buscar exercício/)
      .fill("agachamento");
    await page
      .getByRole("button")
      .filter({ hasText: /agachamento/i })
      .first()
      .click();

    // The prescription is set at insertion time: séries stepper + the reps kinds
    // (Número / Intervalo / Pirâmide / Falha) are all present.
    await expect(page.getByRole("button", { name: "Aumentar Séries" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Diminuir Séries" })).toBeVisible();

    // Choose the pyramid reps type; its load-progression hint appears.
    await page.getByRole("button", { name: "Pirâmide", exact: true }).click();
    await expect(
      page.getByText(/o peso aumenta e as repetições diminuem/).first(),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-exercise-prescription-desktop.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/screens/coach-exercise-prescription-mobile.png",
      fullPage: true,
    });
  });
});
