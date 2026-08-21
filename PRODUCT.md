# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary — the coach (personal trainer / nutrition coach) in Brazil.** Works in
two distinct scenes, and both are real:

- **Desk, setup mode.** Builds workouts, diets and anamnese templates, reviews AI
  drafts, manages the roster and clinic settings. Batched, focused, keyboard and
  large screen.
- **Phone, follow-up mode.** Between sessions: answers check-ins, reads WhatsApp
  traffic, checks who is overdue, glances at a student's evolution. Short bursts,
  one hand, standing up.

Design for both. Neither is the "real" one that the other merely tolerates.

**Secondary — the aluno (student).** Read-only by nature: they never edit
anything, they only see what their coach has **published**. They reach the
product through WhatsApp and the `/student` portal, typically on a low-end
Android phone with unreliable mobile data.

**Third — the platform admin (`role = "admin"`).** Operates the platform itself:
curates the shared exercise/food catalogs, sets per-clinic plan limits, keeps the
manual invoice ledger, watches AI spend. Lives outside every clinic.

## Product Purpose

Progresso IO is a SaaS platform that lets a Brazilian personal coach run their
whole practice in one place — students, workouts, diets, anamneses, check-ins,
evolution tracking, calendar — and automate the communication around it over
**WhatsApp**, which is the channel their students already live in.

Success is a coach who spends less time on their phone relaying information and
more time producing results, while their students never have to learn a new tool.

## Positioning

**WhatsApp is the product's spine, not an integration checkbox.** Competitors
ship an app and hope the student installs it. Progresso assumes the student never
will: check-in reminders, feedback, and diet/workout publication notices are
delivered as WhatsApp template messages driven by the platform's own state
(`computeCheckinDue`, the automations in `src/server/whatsapp-automations.ts`),
and the student can participate without installing anything.

Two supporting mechanisms a neighbouring product could not truthfully copy
without building them:

- **Brazilian-native catalogs.** Foods from the TACO composition tables (15
  groups, 66 nutrients, full per-100g profiles) and 873 exercises with PT-BR
  names and instructions — both with **substitution graphs**, so a student sees
  legitimate alternatives without having to ask.
- **AI drafting constrained to the platform's own catalog.** The generator drafts
  a workout or diet from the real exercise/food rows, saved as an **unpublished
  draft** the coach reviews and edits. The AI never reaches the student directly.

## Operating Context

- **The clinic is the tenant.** Every coach and aluno belongs to exactly one
  clinic; a solo coach owns a one-member clinic. `clinicId` is the tenant key and
  is always derived from the session.
- **Publishing is the core ritual.** A coach works on a **draft**; a student sees
  only a **published version**. Publishing is the moment that produces a WhatsApp
  notice and the student's new reality. Draft/published is a visible, meaningful
  state everywhere, not an implementation detail.
- **The weekly check-in loop.** A student is due on the clinic's preferred
  weekday; punctual students get feedback only, slipping ones get a reminder
  first. This cadence is the product's heartbeat and the main recurring cost
  driver.
- **Branded clinic portal.** A paid clinic publishes a public microsite and
  branded sign-in at `app.progresso.io/<slug>`, themed with its own logo and
  accent color. Clinic branding sits on top of Progresso's, and both must survive.
- **Trial, then Pix.** Every clinic starts on Free with a **14-day trial** that
  grants Solo-level capability (`clinic.trial_ends_at`, no cron needed — it is
  computed at read time). In-app, the coach picks a plan, the server raises a
  fatura at the server-side price and returns a **Pix copia e cola** they pay
  without leaving the app. **Confirming the money is still manual** — an admin
  marks the fatura paid — and that is the one remaining gap in item 0.

## Capabilities and Constraints

**Shipped:** student management, workouts and diets (drafts, published versions,
history, substitutions), anamneses (templates + student fill-in link), check-ins
with photos and coach feedback, evolution tracking, calendar/agenda, exercise and
food catalogs (base + per-clinic custom + favorites), AI workout/diet generation,
WhatsApp automations and message composer, coach team (Clínica plan), branded
clinic portal, 14-day trial + in-app Pix subscription with fatura ledger, aluno portal (`/student`, Dieta and Treino wired; Check-in and
Evolução are "em breve"), platform admin area, notifications, PDF invoices.

**Plan ladder:** Free · Solo R$179 · Clínica R$379 · Enterprise. Caps live in the
`plan_limit` table with nullable per-clinic overrides — `null` means unlimited and
a missing limit must **never** block. Free: 3 alunos, 1 coach, no WhatsApp, no
calendar. Solo: 50 alunos, 1 coach. Clínica: 100 alunos, 3 coaches.

**Enforcement is soft and never destructive.** Limits gate only *new* additions.
A downgraded clinic keeps everything it has; only adds are blocked. Design every
limit surface accordingly — it is a "you can't add another", never a "you lost
your data".

**Terminology (PT-BR, binding).** aluno (never "cliente"/"usuário"), coach,
clínica, treino, dieta, anamnese, check-in, evolução, ficha. Plan names are
`Free`, `Solo`, `Clínica`, `Enterprise`.

**Technical constraints inherited from AGENTS.md:** Next.js App Router,
self-hosted standalone output; Tailwind v4 + shadcn/ui + lucide-react; pages are
client components, all page↔backend traffic goes through zod-validated API route
handlers + TanStack Query; TanStack Form for every form, TanStack Table for every
table; all tenant DB access through the DAL scoped by `clinicId`.

**Undecided:** automated Pix confirmation via webhook (item 0 Phase 2 — the
trial, fatura and Pix payload all ship today; only reconciliation is manual);
whether the R$597-class premium tier returns; Check-in and Evolução in the aluno
portal; every other growth-roadmap item (payments, financials, video, branded
reports, wearables, referral, landing pages, white-label PWA).

## Brand Commitments

- **Name:** Progresso IO. Wordmark is a rounded square "P" mark plus the
  "Progresso IO" text (`src/components/brand/logo.tsx`), with an inverted
  treatment for dark and green surfaces.
- **All UI copy is Brazilian Portuguese.** All route segments and URLs are
  **English** (`/register`, `/forgot-password` — not `/registro`). The one legacy
  exception is the branded portal's `/<slug>/entrar`.
- **The clinic's own branding is a first-class layer.** Logo and accent color set
  by the coach must render correctly on the microsite and branded sign-in without
  breaking Progresso's own identity.

## Evidence on Hand

**Pre-launch. There are no customers.** No testimonials, no named clinics, no
logo wall, no usage numbers, no press, no case studies. **Future work must not
fabricate any of them**, and must not imply social proof that does not exist.

What is real and citable:

- The product itself — every shipped capability above, demonstrable live.
- The catalogs: 873 exercises with PT-BR names/instructions and images
  (free-exercise-db, Unlicense + exercicios-bd-ptbr), and the TACO food
  composition data (15 groups, 66 nutrients).
- The unit-economics model in `docs/monetization.md` (internal; the external
  rates it cites are approximate and dated).
- Twenty-four feature design records in `docs/` — the authoritative description of
  how each area actually behaves.

The landing page's **"Começar 14 dias grátis"** is **true**: the trial is
shipped and `/register` advertises it. The only thing behind it that is not
automated is confirming a Pix payment.

## Product Principles

1. **The student never has to install anything.** WhatsApp is the spine and the
   guaranteed fallback path. No feature may assume the aluno opens the portal.
2. **Nothing reaches the student until the coach publishes it.** Drafts, AI
   output and edits are the coach's private workspace; the published version is
   the contract. Make that boundary unmistakable on screen.
3. **Serve both coach scenes.** Desk-setup density and phone-follow-up reach are
   equal requirements, not a desktop design plus a shrunken copy of it.
4. **Health data is handled like health data.** Anamneses, check-in photos and
   body metrics are sensitive under LGPD. Never surface more of them than the
   task needs, never in a shared or public context, never in error output or
   telemetry.
5. **Limits nudge, they never punish.** Plan boundaries block the next add and
   offer the upgrade; they never remove, hide or degrade what a clinic already
   has.
6. **Assume a cheap Android on bad signal.** For every aluno-facing surface,
   weight, tolerance for slow or dropped connections, and thumb-sized targets are
   correctness requirements, not polish.

## Accessibility & Inclusion

No formal standard (WCAG level or equivalent) has been adopted yet — record one
here when it is decided rather than assuming it.

Two product-specific needs are confirmed and binding:

- **Low-end Android phones and weak mobile data** for alunos: keep aluno-facing
  payloads light, degrade gracefully on a dropped connection, and size touch
  targets for a thumb.
- **One-handed phone use for coaches** in follow-up mode — reachable primary
  actions, no interaction that requires two hands or a precise pointer.
