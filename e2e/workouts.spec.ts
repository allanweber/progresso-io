import { expect, test, type Page } from "@playwright/test";

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
    // Every ficha row leads with the exercise's first image, so a program reads
    // visually and not as a wall of names. "Visible" is not enough — a blocked
    // or 404'd image still occupies the box, so assert the art actually decoded.
    const rowThumbs = page.getByTestId("exercise-thumb");
    expect(await rowThumbs.count()).toBeGreaterThanOrEqual(3); // Ficha A alone
    await expect(rowThumbs.first()).toBeVisible();
    expect(
      await rowThumbs
        .first()
        .evaluate((el: HTMLImageElement) => el.naturalWidth),
    ).toBeGreaterThan(0);
    // Each técnica badge carries a drawn mark (lucide), never an emoji or a
    // unicode glyph — see components/workouts/technique-icon.tsx. The marks
    // must be real SVG *and* distinct from one another, so a technique reads
    // without relying on its pigment.
    const marks: string[] = [];
    for (const label of ["Drop set", "Giant set", "Super set"]) {
      const mark = page
        .getByText(new RegExp(`^${label}`))
        .first()
        .locator("svg");
      await expect(mark).toBeVisible();
      marks.push(await mark.innerHTML());
    }
    expect(new Set(marks).size).toBe(marks.length);
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
    // The coach keeps the dense posture on the very same component the aluno
    // portal steps up (`.posture-reading`, globals.css): a section heading is
    // 15px here, 16px in the portal.
    expect(
      await dialog
        .getByText(/Substituições/)
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe("15px");
    // The image carousel: two frames with prev/next controls.
    await expect(dialog.getByRole("button", { name: "Próxima imagem" })).toBeVisible();
    await dialog.screenshot({
      path: "test-results/screens/coach-exercise-detail-desktop.png",
    });
    // Advance the carousel to the second frame.
    await dialog.getByRole("button", { name: "Próxima imagem" }).click();
    await expect(dialog.getByRole("button", { name: "Imagem anterior" })).toBeVisible();

    // Tapping a substitution opens its own detail dialog (title + execution).
    // The drop-set exercise carries a custom substitute noted "ombro sensível".
    await dialog.getByText("ombro sensível").click();
    const subDialog = page.getByRole("dialog").last();
    await expect(subDialog.getByText(/Como executar/)).toBeVisible();
    await subDialog.screenshot({
      path: "test-results/screens/coach-substitute-detail-desktop.png",
    });
    await page.keyboard.press("Escape"); // close substitute detail
    await page.keyboard.press("Escape"); // close exercise detail
    await expect(dialog).toBeHidden();

    // --- Workout detail + exercise detail (mobile) ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/coach/workouts/${workout.id}`);
    await expect(
      page.getByRole("heading", { name: /Programa completo/ }),
    ).toBeVisible();
    await expect(page.getByTestId("exercise-thumb").first()).toBeVisible();
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
  test("prescribes an exercise at insertion — steppers, Pirâmide séries e Tempo (desktop + mobile)", async ({
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

    // A pirâmide prescribes one set per position: Séries stops being typed and
    // follows the sequence (12-10-8-6 → 4 séries).
    const series = page.getByLabel("Séries");
    await expect(series).toHaveValue("4");
    await expect(page.getByRole("button", { name: "Aumentar Séries" })).toHaveCount(0);

    // Adding/removing a position moves the set count with it.
    await page.getByRole("button", { name: "Adicionar posição" }).click();
    await expect(series).toHaveValue("5");
    await page.getByRole("button", { name: "Remover posição" }).click();
    await expect(series).toHaveValue("4");

    await page.screenshot({
      path: "test-results/screens/coach-exercise-prescription-desktop.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/screens/coach-exercise-prescription-mobile.png",
      fullPage: true,
    });

    // Tempo prescribes seconds per set instead of reps — Séries is typed again.
    await page.getByRole("button", { name: "Tempo", exact: true }).click();
    await expect(page.getByLabel("Tempo em segundos")).toHaveValue("30");
    await expect(page.getByText(/Segundos por série/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Aumentar Séries" })).toBeVisible();

    await page.getByRole("button", { name: "Adicionar ao treino" }).click();
    // The ficha row summarises it as séries × tempo (the pirâmide left 4 séries
    // behind, and Tempo makes them editable again).
    await expect(page.getByText(/4× 30s/).first()).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-exercise-prescription-duration-mobile.png",
      fullPage: true,
    });
  });
});

/**
 * An exercise's photo is how a coach confirms the movement is the right one,
 * and a 36px thumbnail can't do that. Every place a picture is shown must open
 * it full-size — the catalog's gallery and the builder's thumbnails, including
 * the search dropdown, where the row had to be split into two controls (the
 * image expands, the rest picks) and could easily stop picking.
 */
test.describe("exercise images", () => {
  /**
   * The exercise-image host (R2 / CDN) isn't reachable from the e2e browser, so
   * stand in for it — otherwise nothing renders and there is nothing to expand.
   * The two catalog frames (…/0.jpg, …/1.jpg) get different art so a walk
   * through the set is visible.
   */
  const stubImages = (page: Page) =>
    page.route(/\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i, (route) => {
      const second = /1\.(png|jpe?g|webp|gif|avif)/i.test(route.request().url());
      const fill = second ? "#1e293b" : "#334155";
      const label = second ? "Posição final" : "Posição inicial";
      route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${fill}"/><text x="50%" y="50%" fill="#94a3b8" font-family="sans-serif" font-size="15" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`,
      });
    });

  test("opens a catalog image full-size and walks the set (desktop + mobile)", async ({
    page,
  }) => {
    await stubImages(page);

    // A base exercise that actually ships photos — without them there is no
    // gallery, and the test would assert nothing.
    const list = await page.request.get(
      "/api/exercises?search=agachamento&pageSize=1",
    );
    expect(list.ok()).toBeTruthy();
    const { items } = (await list.json()) as {
      items: { id: string; name: string }[];
    };
    const exercise = items[0];
    expect(exercise, "o catálogo semeado precisa ter um agachamento").toBeTruthy();
    const detailRes = await page.request.get(`/api/exercises/${exercise.id}`);
    const { images } = (await detailRes.json()) as { images: string[] };
    expect(images.length).toBeGreaterThan(0);

    // --- The catalog grid: each card leads with the exercise's own photo ---
    await page.goto("/coach/library/exercises?search=agachamento");
    // The cookie banner also carries role="dialog" and would collide with the
    // viewer's locator below.
    await page.getByRole("button", { name: "Aceitar" }).click();
    const cardThumbs = page.getByTestId("exercise-thumb");
    await expect(cardThumbs.first()).toBeVisible();
    expect(
      await cardThumbs
        .first()
        .evaluate((el: HTMLImageElement) => el.naturalWidth),
    ).toBeGreaterThan(0);
    await page.screenshot({
      path: "test-results/screens/coach-exercise-catalog-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(cardThumbs.first()).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-exercise-catalog-mobile.png",
      fullPage: true,
    });
    // Back to the project's Desktop Chrome viewport for the detail screenshots.
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto(`/coach/library/exercises/${exercise.id}`);
    await expect(
      page.getByRole("heading", { name: exercise.name, level: 1 }),
    ).toBeVisible();

    // Each tile is its own control, opening the viewer AT ITS OWN POSITION.
    await page
      .getByRole("button", { name: `Ampliar imagem 1 de ${exercise.name}` })
      .click();
    const viewer = page.getByRole("dialog");
    await expect(viewer.getByRole("heading", { name: exercise.name })).toBeVisible();
    await expect(viewer.getByRole("img", { name: exercise.name })).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-exercise-image-viewer-desktop.png",
    });

    // With more than one frame the viewer counts them and walks with ← / →.
    if (images.length > 1) {
      await expect(viewer.getByText(`1 / ${images.length}`)).toBeVisible();
      await viewer.getByRole("button", { name: "Próxima imagem" }).click();
      await expect(viewer.getByText(`2 / ${images.length}`)).toBeVisible();
      await page.keyboard.press("ArrowLeft");
      await expect(viewer.getByText(`1 / ${images.length}`)).toBeVisible();
    }

    // Esc closes the viewer and leaves the page it opened over.
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(
      page.getByRole("heading", { name: exercise.name, level: 1 }),
    ).toBeVisible();

    // --- Mobile: the same gallery, the same way in ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: `Ampliar imagem 1 de ${exercise.name}` })
      .click();
    await expect(viewer.getByRole("img", { name: exercise.name })).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-exercise-image-viewer-mobile.png",
    });
  });

  test("expands a thumbnail from the builder's search row and ficha row", async ({
    page,
  }) => {
    await stubImages(page);

    await page.goto("/coach/workouts/new");
    await page.getByRole("button", { name: "Aceitar" }).click();
    await page
      .getByPlaceholder("Ex.: Hipertrofia · 4x semana")
      .fill("Treino com fotos");
    await page.getByRole("button", { name: "Nova ficha" }).click();
    await page.getByPlaceholder(/Nome da ficha/).fill("Ficha A · Pernas");
    await page.getByRole("button", { name: "Adicionar exercício" }).click();
    await page.getByPlaceholder(/Buscar exercício/).fill("agachamento");

    // --- The search row: the thumbnail expands without picking the exercise ---
    const thumb = page
      .getByRole("button", { name: /^Ampliar imagem de / })
      .first();
    await expect(thumb).toBeVisible();
    const name = (await thumb.getAttribute("aria-label"))!.replace(
      "Ampliar imagem de ",
      "",
    );
    await thumb.click();
    const viewer = page.getByRole("dialog");
    await expect(viewer.getByRole("heading", { name })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    // Expanding is not picking: the results are still on screen, and the
    // prescription step has not opened.
    await expect(thumb).toBeVisible();
    await expect(page.getByRole("button", { name: "Aumentar Séries" })).toHaveCount(0);

    // --- The rest of the row still picks (it is a separate control now) ---
    // The picking control carries the name AND the category, so match on text
    // rather than on the exact accessible name.
    await page.getByRole("button").filter({ hasText: name }).first().click();
    await expect(page.getByRole("button", { name: "Aumentar Séries" })).toBeVisible();
    await page.getByRole("button", { name: "Adicionar ao treino" }).click();

    // --- The ficha row's thumbnail expands the same way ---
    const rowThumb = page.getByRole("button", {
      name: `Ampliar imagem de ${name}`,
    });
    await expect(rowThumb).toBeVisible();
    await rowThumb.click();
    await expect(viewer.getByRole("heading", { name })).toBeVisible();
    await page.screenshot({
      path: "test-results/screens/coach-builder-image-viewer-desktop.png",
    });
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
  });
});
/**
 * A list's page belongs in the URL, like its filters — but as a real navigation:
 * back and forward must walk the pages instead of dropping the coach back onto
 * whatever they were looking at before the list, opening an exercise from page 2
 * and returning must land on page 2, and a pasted link must open where it
 * points. The exercise catalog is the shared `ExerciseCatalog` the coach library
 * and the admin catalog both render, so this covers both.
 */
test.describe("list pagination", () => {
  test("walks pages with browser back/forward and restores them from a link (desktop + mobile)", async ({
    page,
  }) => {
    const res = await page.request.get("/api/exercises?page=1&pageSize=24");
    expect(res.ok()).toBeTruthy();
    const { total } = (await res.json()) as { total: number };
    expect(
      total,
      "o catálogo semeado precisa passar de uma página",
    ).toBeGreaterThan(24);
    const totalPages = Math.ceil(total / 24);

    await page.goto("/coach/library/exercises");
    await page.getByRole("button", { name: "Aceitar" }).click();
    await expect(page.getByText(`Página 1 de ${totalPages}`)).toBeVisible();
    // The first page stays out of the URL — it is the default, not a state.
    expect(new URL(page.url()).searchParams.get("page")).toBeNull();

    // Paginating is a navigation: it rewrites the URL...
    await page.getByRole("button", { name: "Próxima" }).click();
    await expect(page.getByText(`Página 2 de ${totalPages}`)).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("page"))
      .toBe("2");

    // ...and back/forward walk the pages instead of leaving the list for
    // whatever the coach was looking at before it.
    await page.goBack();
    await expect(page.getByText(`Página 1 de ${totalPages}`)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("page")).toBeNull();
    await page.goForward();
    await expect(page.getByText(`Página 2 de ${totalPages}`)).toBeVisible();

    // Opening an exercise and coming back restores page 2, not page 1.
    // The card to click comes from the same listing the grid renders, so this
    // also proves the second page really holds the second page's exercises.
    const second = await page.request.get("/api/exercises?page=2&pageSize=24");
    const { items } = (await second.json()) as { items: { name: string }[] };
    const name = items[0].name;
    await page.getByRole("link").filter({ hasText: name }).first().click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page.getByText(`Página 2 de ${totalPages}`)).toBeVisible();

    // A pasted link opens straight on its page — and STAYS there: the effect
    // that mirrors the filters into the URL must not strip the page on its
    // mount pass, and the search debounce that follows must not either.
    await page.goto("/coach/library/exercises?page=2");
    await expect(page.getByText(`Página 2 de ${totalPages}`)).toBeVisible();
    await page.waitForTimeout(700);
    await expect(page.getByText(`Página 2 de ${totalPages}`)).toBeVisible();

    await page.screenshot({
      path: "test-results/screens/coach-exercise-catalog-page2-desktop.png",
      fullPage: true,
    });

    // --- Mobile: the same pager, the same URL ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Anterior" }).click();
    await expect(page.getByText(`Página 1 de ${totalPages}`)).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("page"))
      .toBeNull();
    await page.screenshot({
      path: "test-results/screens/coach-exercise-catalog-pager-mobile.png",
      fullPage: true,
    });
  });
});
