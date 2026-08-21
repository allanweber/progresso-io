# Progresso IO

**A multi-tenant SaaS for personal trainers and nutrition coaches** — training
plans, diet plans, client check-ins, WhatsApp automation and AI-assisted program
generation, in one product.

Built end to end: data model, API, UI, billing, deployment, and a test suite
that gates every release. Portuguese-language product for the Brazilian market;
English codebase.

> Every screenshot below is produced by an **asserted end-to-end test**
> (`e2e/portfolio.spec.ts`, 27 tests) running the real production build against
> a real PostgreSQL. Nothing here is a mockup, and nothing is a screenshot
> script — if a feature breaks, the test goes red before it can take a
> misleading picture.

---

## At a glance

| | |
| --- | --- |
| **Stack** | Next.js 16 (App Router, RSC), TypeScript, PostgreSQL, Drizzle ORM, TanStack Query/Table/Form, Tailwind + shadcn/ui, Better Auth |
| **Scale** | 49 tables · 36 migrations · 128 API route handlers · 29 data-access modules · ~68k lines of TypeScript |
| **Tests** | 800 unit + integration (Vitest, real Postgres via PGlite) · 21 e2e specs (Playwright) |
| **Seeded data** | 672 foods (TACO/TBCA) with 624 household measures · 873 exercises with 2 270 substitution links |
| **Integrations** | WhatsApp Business · OpenRouter (LLM) · Cloudflare R2 · Resend · Sentry · Pix |

---

## The problem

A Brazilian personal trainer with 40 clients runs their business out of
WhatsApp, Excel and PDF. Plans are written by hand, macros are added up on a
calculator, check-ins arrive as photos in a chat thread, and every renewal is a
manual reminder. Existing tools are either priced for gyms or are glorified
spreadsheets.

Progresso IO replaces that stack for a solo coach — and scales up to a clinic
with several coaches sharing one roster.

---

## What it does

### 1. Landing, pricing and self-serve sign-up

A real funnel: positioning, feature tour, four-tier pricing, 14-day trial with
no card. The hero shows **actual screenshots of the running app** — the coach's
dashboard and the aluno's phone — captured by the same e2e suite that tests it,
so the marketing page cannot drift away from the product. (It used to be a
mockup drawn in CSS: window chrome and grey bars where text would go. It
photographed well and told a visitor nothing.)

![Landing page](images/01-landing-desktop.png)

### 2. Coach workspace

The dashboard answers one question — *what needs me today*: check-ins waiting
for feedback, clients without an active plan, WhatsApp conversations inside the
24-hour reply window, upcoming appointments.

![Coach dashboard](images/03-coach-dashboard-desktop.png)

Every client is one page with five workspaces: profile & intake, diet, workout,
feedback, progress.

![Client roster](images/04-students-roster-desktop.png)
![Client profile](images/05-student-profile-desktop.png)

### 3. Diet builder on a real food database

672 foods from **TACO/TBCA** (Brazil's official food composition tables) with
full macros, plus household measures (`2 fatias`, `1 unidade`) because nobody
weighs bread. Drag-and-drop meals, per-meal and per-day totals that update as
you type, and per-food substitution lists so the client can swap rice for
cassava without messaging you.

![Diet builder](images/07-diet-builder-desktop.png)

Plans are **versioned and published**. A coach edits a draft; the client keeps
seeing the live version until the coach publishes. Nothing half-finished ever
reaches a client.

![Published diet](images/06-diet-published-desktop.png)

### 4. AI program generation — with the numbers guaranteed

The differentiator, and the part with the most engineering behind it. The coach
states an objective, restrictions, which meals the day has, a macro profile and
optional hard targets; the model composes the plan **from the real catalog**
(never invented foods), and the **server then fits the portions by arithmetic**.

![AI generator](images/08-ai-generator-desktop.png)

Why that last part matters: asked for 2 600 kcal, the model returned 2 827, then
3 214. Asked for 2 500 low-carb, it returned 1 832 with 61% of calories from
carbohydrate. Language models do not add up twenty foods reliably, and asking
more firmly does not fix it. So the server:

- **sums the day from the catalog** and fits portions per food class (protein /
  carb / fat sources, leaving vegetables alone) using iterative proportional
  fitting — a single global factor corrects calories but leaves a low-carb
  request at the carb share it arrived with;
- **derives targets from the anamnesis** — "high protein" becomes 2.2 g per kg
  of the client's recorded body weight, not a share of calories;
- **checks what it can prove**: an avoided food used, two staple carbohydrates
  in one meal (using food-group taxonomy, so rice-and-beans is not a false
  positive), then sends the findings back as one free repair turn;
- **keeps portions human**: whole slices, whole units, grams to the nearest 5.

Cost and cache behaviour are engineered too: the food/exercise catalogue is a
byte-identical prompt prefix shared by every tenant, so provider prompt-caching
hits near 100% instead of near 0%, and every generation is audited with its
token counts and cache-hit ratio.

### 5. Workout builder

873 exercises with muscle/equipment filters, images, and 2 270 substitution
links. Sets, rep sequences (`10-8-6-4`), rest, techniques (superset, drop set,
giant set) and per-exercise notes.

![Workout builder](images/09-workout-builder-desktop.png)

### 6. Custom intake forms

Coaches build their own anamnesis templates — question types, input masks,
validation ranges — rather than filling someone else's form. Six professional
templates ship as starters.

![Anamnesis builder](images/16-anamnesis-builder-desktop.png)

### 7. Check-ins, feedback and progress

Clients submit weight, measurements, photos and how the week went. The coach
reviews, scores an assessment and replies; the client sees the feedback in the
app. Progress becomes a chart, not a memory.

![Check-in feedback](images/10-checkin-feedback-desktop.png)
![Progress](images/11-evolution-desktop.png)

### 8. WhatsApp, integrated

Shared inbox with the **24-hour reply window** made visible (outside it, only
approved templates can be sent — the rule that gets accounts banned when a tool
hides it). Template library with variables, and automated check-in reminders.

![WhatsApp inbox](images/13-whatsapp-inbox-desktop.png)

### 9. Calendar

Appointments, assessments and renewals in one view, merged with check-in due
dates derived from each client's schedule.

![Calendar](images/12-calendar-desktop.png)

### 10. Client mobile app

The client gets their own login: today's plan, meal by meal with household
portions and substitutions, the workout at the gym, check-in submission with
photo upload, and their progress chart. Responsive web — nothing to install.

<p>
  <img src="images/19-student-portal-mobile.png" width="260" alt="Client portal" />
  <img src="images/20-student-diet-mobile.png" width="260" alt="Client diet" />
  <img src="images/21-student-workout-mobile.png" width="260" alt="Client workout" />
</p>

### 11. Clinic branding

Each clinic gets a public microsite at its own slug, a branded login page and
its logo through the client experience.

![Settings](images/18-clinic-settings-desktop.png)

### 12. Platform administration

A separate admin console: every clinic, plan limits and overrides, invoices and
Pix payment, the shared food/exercise catalogues, and AI usage with **cost per
tenant** — measured from the provider where reported, estimated from an
effective-dated price table otherwise.

![Admin AI costs](images/23-admin-ai-costs-desktop.png)
![Admin maintenance](images/24-admin-maintenance-desktop.png)

---

## Engineering highlights

These are the decisions I would want to be asked about.

**Multi-tenancy that cannot leak.** The clinic is the tenant. Every domain row
carries `clinicId`, every query is scoped by it, and the scope comes from the
authenticated session — never from client input. All database access goes
through a data-access layer whose functions *require* a tenant context, so
"forgot the where clause" is not an available mistake. Cross-tenant isolation is
asserted by integration tests, not assumed.

**Prescriptions are versioned, and nutrition is derived live.** A published plan
stores only *references* — which food, how much. Macros and substitution options
are hydrated from the catalogue on read, so correcting a food's data reaches
every client's plan without republishing anything, while the coach's actual
prescription stays immutable.

**The AI is bounded by the domain, not trusted.** The model may only reference
catalogue items by index; an invented index is caught instantly and repaired for
free. Quantities are then computed by the server. This is the difference between
a demo and something you would let near a real person's diet.

**Cost control as a first-class feature.** Token usage, cache-hit ratio and cost
per generation are recorded per tenant, with an effective-dated price table so a
historical month stays correct after a vendor changes prices — and a mistyped
price can be corrected retroactively.

**Tests that describe behaviour.** 800 unit/integration tests run against real
PostgreSQL (PGlite in-process, snapshot-cached — the suite went from 260s to
50s). E2E runs the **standalone production build**, the same artifact that
deploys. Every screenshot in this document is a by-product of an assertion.

**Deployment.** Dockerised standalone build, migrations as a separate job,
health checks, Sentry with source maps, LGPD-compliant analytics gating,
Cloudflare R2 for images with a local-disk fallback for development.

---

## Screens

Every screen at both viewports, in `images/`:

| | Desktop | Mobile |
| --- | --- | --- |
| Landing | `01-landing-desktop.png` | `01-landing-mobile.png` |
| Login | `02-login-desktop.png` | `02-login-mobile.png` |
| Coach dashboard | `03-coach-dashboard-desktop.png` | `03-coach-dashboard-mobile.png` |
| Client roster | `04-students-roster-desktop.png` | `04-students-roster-mobile.png` |
| Client profile | `05-student-profile-desktop.png` | `05-student-profile-mobile.png` |
| Published diet | `06-diet-published-desktop.png` | `06-diet-published-mobile.png` |
| Diet builder | `07-diet-builder-desktop.png` | `07-diet-builder-mobile.png` |
| AI generator | `08-ai-generator-desktop.png` | `08-ai-generator-mobile.png` |
| Workout builder | `09-workout-builder-desktop.png` | `09-workout-builder-mobile.png` |
| Check-in feedback | `10-checkin-feedback-desktop.png` | `10-checkin-feedback-mobile.png` |
| Progress | `11-evolution-desktop.png` | `11-evolution-mobile.png` |
| Calendar | `12-calendar-desktop.png` | `12-calendar-mobile.png` |
| WhatsApp inbox | `13-whatsapp-inbox-desktop.png` | `13-whatsapp-inbox-mobile.png` |
| Food catalogue | `14-food-catalog-desktop.png` | `14-food-catalog-mobile.png` |
| Exercise catalogue | `15-exercise-catalog-desktop.png` | `15-exercise-catalog-mobile.png` |
| Anamnesis builder | `16-anamnesis-builder-desktop.png` | `16-anamnesis-builder-mobile.png` |
| Plan templates | `17-diet-templates-desktop.png` | `17-diet-templates-mobile.png` |
| Clinic settings | `18-clinic-settings-desktop.png` | `18-clinic-settings-mobile.png` |
| Client portal | `19-student-portal-desktop.png` | `19-student-portal-mobile.png` |
| Client diet | `20-student-diet-desktop.png` | `20-student-diet-mobile.png` |
| Client workout | `21-student-workout-desktop.png` | `21-student-workout-mobile.png` |
| Admin console | `22-admin-console-desktop.png` | `22-admin-console-mobile.png` |
| Admin AI costs | `23-admin-ai-costs-desktop.png` | `23-admin-ai-costs-mobile.png` |
| Admin maintenance | `24-admin-maintenance-desktop.png` | `24-admin-maintenance-mobile.png` |

## Reproducing these screenshots

```bash
npm run test:e2e -- --project=portfolio
npm run landing:optimize
```

The first boots a throwaway PostgreSQL, migrates and seeds it, builds the
production bundle, runs the 30-test tour, and writes both `portfolio/images/`
(this document) and `public/landing/` (the marketing page's product imagery,
shot at 2× for retina). The second downscales the latter.
