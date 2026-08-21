import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * The portfolio tour: every surface of the product, asserted and photographed.
 *
 * This is a **real spec**, not a screenshot script. Each stop makes assertions
 * about what has to be on the screen for that feature to be worth showing —
 * the roster shows alunos, the diet builder shows a total that adds up, the
 * aluno portal shows a published plan and not a draft. If a feature regresses,
 * this goes red *before* it produces a misleading picture; a screenshot job
 * with no assertions would happily photograph an empty page.
 *
 * Every stop is captured at both viewports, because the coach works at a desk
 * and the aluno opens their plan on a phone — a portfolio that only shows one
 * of those is hiding half the work.
 *
 * Output: `portfolio/images/<name>-{desktop,mobile}.png`.
 */

const COACH_STORAGE = "e2e/.auth/coach.json";
const ALUNO_STORAGE = "e2e/.auth/aluno.json";
const ADMIN_STORAGE = "e2e/.auth/admin.json";

const OUT = "portfolio/images";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

/**
 * Photographs the current page at both viewports.
 *
 * The desktop shot comes last so the page is left wide for whatever the test
 * asserts next — a test that continues at 390px against a desktop layout finds
 * different elements and fails for reasons that have nothing to do with the
 * feature.
 */
async function shoot(page: Page, name: string, desktop = DESKTOP) {
  await expect(page.getByRole("dialog", { name: "Aviso de cookies" })).toBeHidden();

  await page.setViewportSize(MOBILE);
  await page.waitForTimeout(250);
  // Viewport-only on mobile, deliberately. `fullPage` stitches a tall image and
  // stamps every `position: fixed` element — the portal's bottom tab bar — into
  // the middle of the page, which is an artifact of the screenshot and not
  // something any aluno sees. What a phone shows is one screen.
  await page.screenshot({ path: `${OUT}/${name}-mobile.png` });

  await page.setViewportSize(desktop);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}-desktop.png`, fullPage: true });
}

/**
 * Pre-answers the LGPD consent banner, before any page script runs.
 *
 * Dismissing it by clicking was a race: the banner only mounts after
 * hydration, so a shot taken quickly enough found nothing to click and then
 * photographed the banner sitting over the feature. Seeding the same
 * localStorage key the component reads removes the race instead of widening
 * the window — and "already consented" is the honest state to photograph, it
 * is what a coach sees from their second visit on.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("progresso-cookie-consent", "accepted");
  });
});

type StudentList = { students: { id: string; firstName: string }[] };

/** The seeded aluno with a full history — anamnese, diet, workout, check-ins. */
async function anaId(request: APIRequestContext): Promise<string> {
  const { students } = (await (await request.get("/api/students")).json()) as StudentList;
  const ana = students.find((s) => s.firstName === "Ana");
  expect(ana, "the seeded aluno with a complete history").toBeTruthy();
  return ana!.id;
}

test.describe("portfolio — público", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("landing page sells the product", async ({ page }) => {
    await page.goto("/");
    // A landing page that does not name the audience and offer a way in is a
    // brochure, not a funnel.
    await expect(page.getByRole("link", { name: /Entrar/ }).first()).toBeVisible();
    await shoot(page, "01-landing");
  });

  test("login is branded and offers the whole recovery path", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    // Losing a password must not mean losing the account.
    await expect(page.getByRole("link", { name: /Esqueci|senha/i }).first()).toBeVisible();
    await shoot(page, "02-login");
  });
});

test.describe("portfolio — coach", () => {
  test.use({ storageState: COACH_STORAGE });

  test("dashboard triages the day", async ({ page }) => {
    await page.goto("/coach");
    // The dashboard's job is to answer "what needs me today", so it has to
    // carry the plan state and the work queues, not just a welcome.
    await expect(page.getByText(/alunos?/i).first()).toBeVisible();
    await shoot(page, "03-coach-dashboard");
  });

  test("roster lists the alunos with their state", async ({ page }) => {
    await page.goto("/coach/students");
    await expect(page.getByRole("heading", { name: /Alunos/i })).toBeVisible();
    await expect(page.getByText("Ana").first()).toBeVisible();
    await shoot(page, "04-students-roster");
  });

  test("student profile gathers everything about one aluno", async ({ page, request }) => {
    await page.goto(`/coach/students/${await anaId(request)}`);
    await expect(page.getByText("Ana").first()).toBeVisible();
    // The tabs are the product's spine: one aluno, five workspaces.
    for (const tab of ["Dieta", "Treino", "Feedback"]) {
      await expect(page.getByRole("link", { name: tab }).first()).toBeVisible();
    }
    await shoot(page, "05-student-profile");
  });

  test("the published diet is read-only until the coach edits it", async ({
    page,
    request,
  }) => {
    await page.goto(`/coach/students/${await anaId(request)}/diet`);
    // The published state is a READ view — the plan the aluno is following,
    // with its version and its per-meal totals. Editing is a deliberate act,
    // which is what keeps a live plan from being changed by accident.
    await expect(page.getByRole("heading", { name: "Cutting" })).toBeVisible();
    await expect(page.getByText(/Versão \d+ · publicada/)).toBeVisible();
    await expect(page.getByText(/kcal/).first()).toBeVisible();
    await shoot(page, "06-diet-published");
  });

  test("the builder totals the day as the coach edits it", async ({ page, request }) => {
    await page.goto(`/coach/students/${await anaId(request)}/diet`);
    // "Editar" on a clean published plan, "Continuar editando" once a draft
    // exists. Both open the same builder, and which one is showing depends on
    // history this test does not own — so it must not care.
    await page.getByRole("button", { name: /^(Editar|Continuar editando)$/ }).click();
    // The running total is the feature: a diet screen that lists foods without
    // summing them leaves the coach doing arithmetic on paper.
    await expect(page.getByText(/Total da dieta/i)).toBeVisible();
    await expect(page.getByText(/kcal/).first()).toBeVisible();
    await shoot(page, "07-diet-builder");
  });

  test("the AI dialog asks the questions a nutritionist would", async ({ page, request }) => {
    await page.goto(`/coach/students/${await anaId(request)}/diet`);
    await page.getByRole("button", { name: "Gerar dieta com IA" }).click();
    const replace = page.getByRole("button", { name: "Substituir rascunho" });
    if (await replace.isVisible()) await replace.click();

    // Everything that makes the generation controllable rather than a slot
    // machine: restrictions, the day's shape, the macro profile, hard targets.
    await expect(page.getByLabel("Objetivo")).toBeVisible();
    await expect(page.getByText("Restrições alimentares")).toBeVisible();
    await expect(page.getByText("Refeições do dia")).toBeVisible();
    await expect(page.getByText("Perfil de macros")).toBeVisible();
    await expect(page.getByRole("group", { name: "Metas" })).toBeVisible();
    // Credits are shown before one is spent.
    await expect(page.getByText(/gerações? usadas? este mês/)).toBeVisible();
    // Taller than the standard shot: this dialog scrolls inside itself, so a
    // 900px viewport photographs it cut off at "Evitar" and hides the macro
    // profile and the targets — the two things worth showing.
    await shoot(page, "08-ai-generator", { width: 1440, height: 1500 });
  });

  test("workout builder carries sets, reps and techniques", async ({ page, request }) => {
    await page.goto(`/coach/students/${await anaId(request)}/workout`);
    await expect(page.getByRole("button", { name: "Gerar treino com IA" })).toBeVisible();
    await shoot(page, "09-workout-builder");
  });

  test("feedback closes the loop on a check-in", async ({ page, request }) => {
    await page.goto(`/coach/students/${await anaId(request)}/feedback`);
    await shoot(page, "10-checkin-feedback");
  });

  test("evolution turns check-ins into a trend", async ({ page, request }) => {
    await page.goto(`/coach/students/${await anaId(request)}/evolution`);
    await shoot(page, "11-evolution");
  });

  test("calendar merges appointments and derived check-ins", async ({ page }) => {
    await page.goto("/coach/calendar");
    await expect(page.getByRole("heading", { name: /Agenda|Calendário/i })).toBeVisible();
    await shoot(page, "12-calendar");
  });

  test("whatsapp inbox keeps the 24h window visible", async ({ page }) => {
    await page.goto("/coach/whatsapp");
    await expect(page.getByRole("heading", { name: /WhatsApp/i }).first()).toBeVisible();
    await shoot(page, "13-whatsapp-inbox");
  });

  test("food catalog is a real TACO-backed database", async ({ page }) => {
    await page.goto("/coach/library/foods");
    // Thousands of rows with macros is the moat here — a demo with twenty
    // hand-typed foods is not the same product.
    await expect(page.getByPlaceholder(/Buscar/i).first()).toBeVisible();
    await shoot(page, "14-food-catalog");
  });

  test("exercise catalog is filterable by muscle and equipment", async ({ page }) => {
    await page.goto("/coach/library/exercises");
    await expect(page.getByPlaceholder(/Buscar/i).first()).toBeVisible();
    await shoot(page, "15-exercise-catalog");
  });

  test("anamnese templates are built by the coach, not hard-coded", async ({ page }) => {
    await page.goto("/coach/anamneses");
    await expect(page.getByRole("heading", { name: /Anamnese/i }).first()).toBeVisible();
    await shoot(page, "16-anamnesis-builder");
  });

  test("diet and workout templates seed a new clinic's library", async ({ page }) => {
    await page.goto("/coach/diets");
    await expect(page.getByRole("heading", { name: /Dietas/i }).first()).toBeVisible();
    await shoot(page, "17-diet-templates");
  });

  test("settings carry the clinic's own branding", async ({ page }) => {
    await page.goto("/coach/settings");
    await expect(page.getByRole("heading", { name: /Config/i }).first()).toBeVisible();
    await shoot(page, "18-clinic-settings");
  });
});

test.describe("portfolio — aluno", () => {
  test.use({ storageState: ALUNO_STORAGE });

  test("the portal opens on the published plan, never a draft", async ({ page }) => {
    await page.goto("/student");
    // The whole publishing model exists so an aluno never sees work in
    // progress. If a draft leaked here the feature would be broken.
    await expect(page.getByText(/rascunho/i)).toHaveCount(0);
    await shoot(page, "19-student-portal");
  });

  test("the aluno's diet shows portions in household measures", async ({ page }) => {
    await page.goto("/student");
    // The tabs are plain buttons, rendered twice — a desktop rail and a mobile
    // bar — so the visible one is whichever the viewport is showing.
    await page.getByRole("button", { name: "Dieta", exact: true }).first().click();
    // "2 unidade · 100 g" rather than a bare weight: the aluno is not holding
    // a kitchen scale.
    await expect(page.getByText(/kcal/).first()).toBeVisible();
    await shoot(page, "20-student-diet");
  });

  test("the aluno's workout is readable at the gym", async ({ page }) => {
    await page.goto("/student");
    await page.getByRole("button", { name: "Treino", exact: true }).first().click();
    await expect(page.getByText(/série|rep/i).first()).toBeVisible();
    await shoot(page, "21-student-workout");
  });
});

test.describe("portfolio — admin", () => {
  test.use({ storageState: ADMIN_STORAGE });

  test("the platform console lists every clinic", async ({ page }) => {
    await page.goto("/admin");
    await shoot(page, "22-admin-console");
  });

  test("AI usage and cost are observable per tenant", async ({ page }) => {
    await page.goto("/admin/ai");
    // Cost control is the difference between an AI feature and an AI bill.
    await expect(page.getByText(/tokens|custo|gerações/i).first()).toBeVisible();
    await shoot(page, "23-admin-ai-costs");
  });

  test("maintenance keeps the shared catalogs current", async ({ page }) => {
    await page.goto("/admin/maintenance");
    await shoot(page, "24-admin-maintenance");
  });
});

/**
 * The landing page's product imagery — real screenshots of the real app,
 * replacing the grey-rectangle mockup the hero used to draw in CSS.
 *
 * Captured at **deviceScaleFactor 2** so they stay sharp on a retina display,
 * then downscaled by `scripts/optimize-landing.mjs`. They land in `public/`
 * because the marketing page serves them; the tour's own images stay in
 * `portfolio/`.
 *
 * The demo tenant's overdue-invoice banner is hidden for these shots only. It
 * is a notification about *that seeded clinic's* billing, not part of any
 * feature being advertised — and every other pixel is the untouched product.
 */
const LANDING_OUT = "public/landing";

async function hideTenantBanner(page: Page) {
  await page.addStyleTag({ content: '[role="status"] { display: none !important; }' });
}

test.describe("landing assets — coach", () => {
  test.use({
    storageState: COACH_STORAGE,
    // 800 rather than 900: the dashboard's content ends around 780px and the
    // rest is empty page, which in the hero reads as a panel with a hole in the
    // bottom half rather than as a product.
    viewport: { width: 1440, height: 800 },
    deviceScaleFactor: 2,
  });

  test("the hero shot is a real workspace with loaded data", async ({ page }) => {
    await page.goto("/coach");
    // **The data must have arrived.** A label is on screen from the first
    // paint, so asserting one photographs a skeleton: the first version of this
    // shot was a dashboard of "Carregando…" and "•••" in every widget, and the
    // test went green because "Alunos ativos" was technically visible.
    await expect(page.getByText("Carregando…")).toHaveCount(0);
    await expect(page.getByText("•••")).toHaveCount(0);
    // Queues with real counts in them — the thing the hero is claiming.
    await expect(page.getByRole("heading", { name: "Sua fila de hoje" })).toBeVisible();
    await hideTenantBanner(page);
    await page.screenshot({ path: `${LANDING_OUT}/app-dashboard.png` });
  });

  test("the second shot is a real plan with real food and real macros", async ({
    page,
    request,
  }) => {
    await page.goto(`/coach/students/${await anaId(request)}/diet`);
    await expect(page.getByText("Carregando…")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Cutting" })).toBeVisible();
    await expect(page.getByText("Arroz, tipo 1, cozido").first()).toBeVisible();
    await expect(page.getByText(/kcal/).first()).toBeVisible();
    await hideTenantBanner(page);
    await page.screenshot({ path: `${LANDING_OUT}/app-diet.png` });
  });
});

test.describe("landing assets — aluno", () => {
  test.use({
    storageState: ALUNO_STORAGE,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  test("the phone shot shows a published plan", async ({ page }) => {
    await page.goto("/student");
    // Marketing must not show a draft: the whole publishing model exists so an
    // aluno never sees one.
    await expect(page.getByText("Carregando…")).toHaveCount(0);
    await expect(page.getByText(/rascunho/i)).toHaveCount(0);
    await expect(page.getByText(/kcal/).first()).toBeVisible();
    await page.screenshot({ path: `${LANDING_OUT}/app-portal.png` });
  });
});

/**
 * The landing page's FEATURE imagery — the coach's screens, cropped.
 *
 * Cropped, not whole windows, and that is the point. A 1440px screenshot shown
 * in a ~620px feature column renders at 0.43 and every label turns to mush; a
 * ~760px crop of the region that actually demonstrates the feature renders near
 * 1:1 and can be read. The hero can afford a whole window because it spans the
 * container; a feature row cannot.
 *
 * Coach screens throughout: the coach is who pays for this. The aluno's phone
 * appears once, as the secondary image it is.
 */
const FEATURE_VIEWPORT = { width: 1280, height: 900 };

/**
 * Clips `size` out of the page starting at the top-left of `anchor`.
 *
 * Anchored on an element rather than fixed coordinates so a layout change moves
 * the crop with the content instead of silently photographing the gap next to
 * it.
 */
async function shootRegion(
  page: Page,
  name: string,
  anchor: ReturnType<Page["locator"]>,
  size: { width: number; height: number },
) {
  const box = await anchor.boundingBox();
  expect(box, `bounding box for the ${name} crop`).toBeTruthy();
  await page.screenshot({
    path: `${LANDING_OUT}/${name}.png`,
    clip: { x: box!.x, y: box!.y, width: size.width, height: size.height },
  });
}

test.describe("landing assets — coach features", () => {
  test.use({
    storageState: COACH_STORAGE,
    viewport: FEATURE_VIEWPORT,
    deviceScaleFactor: 2,
  });

  test("the diet feature shows a day that adds up", async ({ page, request }) => {
    await page.goto(`/coach/students/${await anaId(request)}/diet`);
    await page.getByRole("button", { name: /^(Editar|Continuar editando)$/ }).click();
    await expect(page.getByText(/Total da dieta/i)).toBeVisible();
    await expect(page.getByText("Arroz, tipo 1, cozido").first()).toBeVisible();
    await hideTenantBanner(page);
    // From the totals bar down through the first meal — the running total next
    // to the foods that produce it is the whole claim.
    await shootRegion(
      page,
      "feat-diet",
      page.getByText(/Total da dieta/i),
      { width: 700, height: 470 },
    );
  });

  test("the AI feature shows the questions, not a magic button", async ({
    page,
    request,
  }) => {
    await page.goto(`/coach/students/${await anaId(request)}/diet`);
    await page.getByRole("button", { name: "Gerar dieta com IA" }).click();
    const replace = page.getByRole("button", { name: "Substituir rascunho" });
    if (await replace.isVisible()) await replace.click();
    await expect(page.getByText("Restrições alimentares")).toBeVisible();
    await expect(page.getByText("Perfil de macros")).toBeVisible();
    // The dialog is ~470px wide natively, so this crop is shown at roughly its
    // own size — the sharpest image on the page.
    await shootRegion(
      page,
      "feat-ai",
      page.getByRole("dialog").first(),
      { width: 500, height: 620 },
    );
  });

  test("the WhatsApp feature shows the inbox with the reply window", async ({ page }) => {
    await page.goto("/coach/whatsapp");
    await expect(page.getByText("Carregando…")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /WhatsApp/i }).first()).toBeVisible();
    await hideTenantBanner(page);
    await shootRegion(
      page,
      "feat-whatsapp",
      page.getByRole("heading", { name: /WhatsApp/i }).first(),
      { width: 760, height: 480 },
    );
  });

  test("the calendar feature shows a real week", async ({ page }) => {
    await page.goto("/coach/calendar");
    await expect(page.getByText("Carregando…")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /Agenda|Calendário/i }),
    ).toBeVisible();
    await hideTenantBanner(page);
    await shootRegion(
      page,
      "feat-calendar",
      page.getByRole("heading", { name: /Agenda|Calendário/i }),
      { width: 760, height: 470 },
    );
  });

  test("the workout feature shows a real session", async ({ page, request }) => {
    await page.goto(`/coach/students/${await anaId(request)}/workout`);
    await expect(page.getByText("Carregando…")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Gerar treino com IA" })).toBeVisible();
    await hideTenantBanner(page);
    await shootRegion(
      page,
      "feat-workout",
      page.getByRole("button", { name: "Gerar treino com IA" }),
      { width: 720, height: 470 },
    );
  });

  test("the roster feature shows the alunos and their state", async ({ page }) => {
    await page.goto("/coach/students");
    await expect(page.getByText("Carregando…")).toHaveCount(0);
    await expect(page.getByText("Ana").first()).toBeVisible();
    await hideTenantBanner(page);
    await shootRegion(
      page,
      "feat-students",
      page.getByRole("heading", { name: /Alunos/i }),
      { width: 760, height: 430 },
    );
  });
});

test.describe("landing assets — coach on a phone", () => {
  test.use({
    storageState: COACH_STORAGE,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  test("the coach's own dashboard is usable on a phone", async ({ page }) => {
    await page.goto("/coach");
    await expect(page.getByText("Carregando…")).toHaveCount(0);
    await expect(page.getByText("•••")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Sua fila de hoje" })).toBeVisible();
    await hideTenantBanner(page);
    // Below `lg` the hero cannot show a 1440px window, and the answer is NOT to
    // fall back to the aluno's app: the coach is the buyer. Their own dashboard
    // at phone width is both legible and the right thing to be selling.
    await page.screenshot({ path: `${LANDING_OUT}/app-coach-phone.png` });
  });
});
