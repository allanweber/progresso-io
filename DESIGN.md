---
name: Progresso IO
description: A clinical record made legible — paper-white panels on a cool ground, emerald reserved for what is alive.
colors:
  primary: "#059669"
  primary-hover: "#047857"
  primary-light: "#f0fdf4"
  primary-light-border: "#bbf7d0"
  foreground: "#0f172a"
  text-secondary: "#475569"
  muted-foreground: "#64748b"
  meta: "#94a3b8"
  background: "#ffffff"
  surface-light: "#f8fafc"
  ground-aluno: "#eef1f5"
  surface-dark: "#0f172a"
  surface-dark-mid: "#1e293b"
  border: "#e2e8f0"
  border-light: "#f1f5f9"
  destructive: "#ef4444"
  warn-bg: "#fef3c7"
  warn-fg: "#92400e"
  base-bg: "#eef2ff"
  base-fg: "#4338ca"
typography:
  display:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "clamp(38px, 5vw, 60px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  subtitle:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  body-dense:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  eyebrow:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.08em"
rounded:
  control: "10px"
  panel: "16px"
  chip: "9999px"
  sm: "8px"
spacing:
  panel-padding: "24px"
  panel-gap: "24px"
  control-gap: "10px"
  section-rhythm: "96px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "40px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "40px"
  button-outline-hover:
    textColor: "{colors.primary}"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
    height: "44px"
    typography: "{typography.body}"
  input-focus:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
  card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
    padding: "24px"
  badge-default:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.chip}"
    padding: "4px 14px"
  nav-item-active:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design System: Progresso IO

## Overview

**Creative North Star: "A Ficha Limpa" (The Clean Chart)**

Progresso IO looks like a clinical record that someone actually enjoys reading.
Paper-white panels rest on a cool grey ground, separated by the faintest possible
shadow — never floated, never dramatized. Information is dense but never crowded:
a coach scanning fifty alunos should find the one who slipped without reading a
single word twice. The chart metaphor is not decoration; it is the product's own
vocabulary (ficha, anamnese, evolução) made visual.

Emerald is the one color with a job. It marks what is **alive** — an active
aluno, a published version, the current nav item, the field you are typing in.
Everything else is slate: near-black for what matters, mid-grey for context,
pale grey for the scaffolding that holds it together. The restraint is what makes
the emerald legible; a screen where everything is branded is a screen where
nothing signals.

The controls are built to be hit, not admired. Borders are 1.5px rather than
1px, inputs are 44px tall, the focus ring is a 3px halo you cannot miss. This is
equipment for a coach holding a phone in one hand at the gym and for an aluno on
a cheap Android in bad signal — both real, both designed for. And the system does
not move: 138 color transitions against 2 `transition-all`, no hover lift
anywhere in the codebase. Stillness is the house style.

**Key Characteristics:**

- Paper-white panels (16px radius) on a cool slate ground, separated by a 5%-opacity hairline
- Emerald as ink and edge, rarely as fill — under ~10% of any screen
- Space Grotesk for structure, DM Sans for reading; a two-font system with no third voice
- Sturdy controls: 1.5px borders, 44px inputs, an unmissable 3px focus ring
- Colour-only motion — the interface never rises, slides, or bounces
- Two postures on one token set: a desktop-first coach app and a phone-first aluno portal

## Colors

A slate system with a single emerald voice — cool, clinical, and deliberately
low-chroma everywhere except the one place that signals life.

### Primary

- **Vital Emerald** (`#059669`): the color of the live and the actionable. It
  marks state (`ativa`, `publicado`, `em dia`), the one primary action on a
  screen, the current nav item, and every interactive edge on hover and focus.
  It appears as ink (176 usages), as edge (97), and as fill only on small shapes
  — buttons, avatars, nav pills (65).
- **Deep Emerald** (`#047857`): the pressed and hovered state of the primary
  fill, and the text color on pale emerald surfaces where `#059669` would be too
  light to read.
- **Emerald Wash** (`#f0fdf4`): the pale tint behind an active nav item, a
  default badge, or a success panel. Never a page background.
- **Emerald Hairline** (`#bbf7d0`): the border on a default badge, the only
  place a mid-emerald edge is used at rest.

### Neutral

- **Ink** (`#0f172a`): body copy, headings, table values — everything the reader
  is actually here for. Also the ground for the two dark surfaces below.
- **Reading Grey** (`#475569`): secondary prose, table cell values, the resting
  color of outline buttons and nav labels. The workhorse of dense screens.
- **Context Grey** (`#64748b`): captions, helper text, descriptions under a
  title. Present but not competing.
- **Meta Grey** (`#94a3b8`): column headers, timestamps, "last activity" — the
  labels on the chart rather than the readings. Deliberately quiet.
- **Paper** (`#ffffff`): every panel, card, table, input and the coach's rail.
  The surface the work sits on.
- **Cool Ground** (`#f8fafc`): the coach app's page background — the desk the
  paper lies on.
- **Aluno Ground** (`#eef1f5`): the aluno portal's page background, a half-step
  cooler and darker than the coach's, so their app feels like a different room.
  *Currently a literal in `src/app/student/page.tsx`, not yet a token.*
- **Divider** (`#e2e8f0`): panel borders, input strokes, the header rule.
- **Hairline** (`#f1f5f9`): table row separators and the faintest internal
  divisions — visible only when you look for them.
- **Night Slate** (`#0f172a`) / **Night Slate Mid** (`#1e293b`): the dark
  surfaces for the landing product mockup and the dark theme's card layer.

### Tertiary

Status pigments, used only inside chips and banners — never as a surface.

- **Warn** (`#fef3c7` on `#92400e`): a fatura approaching due, a check-in overdue.
- **Danger** (`#ef4444`): a vencida fatura, a destructive action, a field in error.
- **Base Indigo** (`#eef2ff` on `#4338ca`): the catalog chip that marks a row as
  platform **base** data rather than the clinic's own.

### Named Rules

**The One Voice Rule.** Emerald is the only chromatic voice in the interface.
Every other color in a coach or aluno screen is slate, or a status pigment
confined to a chip. If a screen needs a second accent to work, the screen is
wrong, not the palette.

**The Alive Rule.** Emerald describes the *state of a real thing*, not the
importance of a UI element. An active aluno, a published version, the tab you are
on, the input you are in. It never tints a section header, an icon that is merely
decorative, or a background that means nothing.

**The Two Grounds Rule.** `#f8fafc` is the coach's ground; `#eef1f5` is the
aluno's. A surface never sits on the wrong one. That half-step of temperature is
the entire signal that says which app you are in.

## Typography

**Display Font:** Space Grotesk (with `system-ui`, `sans-serif`)
**Body Font:** DM Sans (with `system-ui`, `sans-serif`)

Both are self-hosted variable woff2 files vendored into the repo
(`src/app/fonts/`), loaded via `next/font/local` with `display: swap` — a
deliberate choice over `next/font/google`, which 404s intermittently in CI.
Space Grotesk carries weights 400–700, DM Sans 400–600.

**Character:** Space Grotesk's slightly mechanical geometry gives headings and
numbers a technical, instrument-panel confidence — it reads as *measurement*.
DM Sans underneath is warm, round and untiring at 13–14px, which is where this
product actually lives. The pairing lets a screen be dense without feeling harsh.

### Hierarchy

- **Display** (700, `clamp(38px, 5vw, 60px)`, 1.1, `-0.03em`): the landing hero
  headline. One per marketing page, never inside the app.
- **Headline** (700, 24px, `tracking-tight`): the page title on every coach,
  admin and aluno screen. This is the app's true top level.
- **Title** (600, 18px): panel and card titles, dialog titles.
- **Subtitle** (600, 15px, Space Grotesk): the name of a section *inside* a
  panel or dialog — "Como executar", "Substituições", a meal's name, "Dietas
  anteriores". It is subordinate to the Title above it and unmistakably above
  Body, which 14px semibold could not be at a 1px remove.
- **Body** (400, 14px, 1.6): the default. Descriptions, prose, form values,
  button labels. Keep marketing prose to a `max-w-[460px]`–`max-w-[560px]`
  measure; app prose is bounded by its panel.
- **Body Dense** (400, 13px): table cells, list-row metadata, secondary values
  inside a card. The single most-used size in the app after `body` — this is what
  makes a fifty-row roster fit without a scrollbar marathon.
- **Label** (600, 12px): field labels, column headers, chip text.
- **Eyebrow** (700, 10px, `0.08em`, uppercase): the small tag above a feature
  title, and the "Diferencial" / "Mais usado" markers. Uppercase is reserved for
  this one role.

### Named Rules

**The Two Voices Rule.** Space Grotesk sets structure — page titles, panel
titles, numbers a coach reads at a glance. DM Sans carries everything meant to be
read as language. There is no third font, and no role that uses both.

**The Uppercase Licence.** Uppercase appears only in the 10px eyebrow with
`0.08em` tracking. Buttons, labels, headings and nav items are sentence case,
in Portuguese, always.

**The Named Rung Rule.** Every size in the app comes from a named `text-*`
utility — `text-eyebrow · text-label · text-body-dense · text-body ·
text-subtitle · text-title · text-headline`, registered in `globals.css`
under `@theme inline`. There is no `text-[13px]`, and no half-step: a value
that needs a bracket is a role the system has not named yet. Verify with:

```bash
grep -rn "text-\[[0-9.]*px\]" src --include=*.tsx
```

**The Two Postures Rule.** The ramp is one system read at two distances. The
coach's is the default — desk density, a fifty-row roster. The aluno's is
`.posture-reading`, which redefines `--fs-body-dense`, `--fs-body` and
`--fs-subtitle` one rung up (14 / 15 / 16) for a phone held at arm's length in
a gym. The structural rungs — eyebrow, label, title, headline — hold in both,
so hierarchy is identical and only what you *read* grows. This is why the
utilities are declared `@theme inline`: the value resolves at the element, not
at `:root`, so a subtree can shift the whole ramp with three custom properties
and no prop threading. A dialog portals to `<body>` and leaves that subtree, so
it carries `posture-reading` (or `posture="reading"`) itself.

**No Synthetic Bold.** The vendored variable faces carry Space Grotesk 400–700
and **DM Sans 400–600**. `font-bold` on body text asks for a 700 DM Sans that
is not in the file, and the browser smears a fake one — visible on exactly the
cheap Android the aluno portal is built for. Body text tops out at
`font-semibold`; 700 belongs to `font-heading`.

## Layout

**The coach app** is a fixed 240px white rail on the left from `md` up, becoming
a header-triggered drawer (`Sheet`, side left) below it. The content column is
explicitly `min-w-0` so a wide table scrolls inside its own container instead of
forcing horizontal overflow on the page — a rule that matters on every listing
screen. Page content is centered in a container sized to its density: `max-w-2xl`
to `max-w-3xl` for forms and detail views, `max-w-5xl` to `max-w-6xl` for
listings and dashboards.

**The aluno portal** is phone-first: a 60px white header appears only from `lg`,
while below it a solid emerald header carries the aluno's avatar, name and
clinic, and a fixed bottom tab bar handles navigation with
`pb-[calc(0.7rem+env(safe-area-inset-bottom,0))]` so it clears the home
indicator. From `lg` the layout becomes `grid-cols-[262px_1fr]` with a sticky
profile card and nav panel on the left. Container is `max-w-[1180px]`.

**Marketing surfaces** use a `max-w-[1120px]` container with `px-6` gutters and
a `py-20`–`py-24` vertical rhythm between sections — roughly 4× the app's
internal spacing, which is what makes a landing page breathe next to a dashboard.

**Rhythm.** Panels pad at 24px (`p-6`) and separate at 24px (`gap-6`). Within a
panel, related controls sit 10px apart, groups 20px. Page title to first panel is
24px. Table cells are `px-4 py-3`.

**Breakpoints** are Tailwind defaults: `sm` 640px, `md` 768px, `lg` 1024px.
`sm` is the busiest (128 usages) — most adaptation happens between phone and
large phone, not between laptop and desktop.

### Named Rules

**The Two Renderings Rule.** A data listing ships twice: a `<Table>` from `md`
up, and a stack of tappable cards below it — same data, different shape, not a
squeezed table. Every roster, catalog and history view follows this.

**The min-w-0 Rule.** Any flex or grid child that can contain a table, a long
name, or user text carries `min-w-0`. Horizontal page scroll is a defect, not a
tradeoff.

## Elevation & Depth

The system is near-flat by conviction. Panels sit a hairline above the ground and
**never lift** — there is not one `hover:shadow` or `hover:translate-y` in the
codebase. Hover is communicated entirely through border and text color. Depth is
spent only where something is genuinely floating above the page: a dropdown, a
dialog, a sheet. Everything else is separated by tone and a whisper of shadow.

### Shadow Vocabulary

- **Rest** (`box-shadow: 0 1px 8px rgba(15,23,42,0.05)`): every panel, card,
  table container, empty state and auth card. The single resting elevation in the
  system, used 184 times.
- **Overlay** (`box-shadow: 0 8px 40px rgba(15,23,42,0.15)`): dialog, sheet,
  select content, popover, the notification dropdown and transient toasts —
  anything genuinely floating above the page.
- **Overlay, upward** (`box-shadow: 0 -8px 40px rgba(15,23,42,0.15)`): the same
  weight cast upward, for a surface anchored to the bottom of the viewport where
  a downward shadow would fall off-screen. Currently the cookie banner alone.
  This is a direction change, not a fourth tier — the blur and opacity are
  Overlay's.
- **Theatre** (`box-shadow: 0 32px 80px rgba(15,23,42,0.25)`): the landing hero's
  product mockup only. A marketing device, never permitted inside the app.

The whole app now uses these four values and nothing else. Verify with:

```bash
grep -rho "shadow-\[[^]]*\]" src --include=*.tsx | sort | uniq -c
```

Four lines out means the system is intact; a fifth is a regression.

### Named Rules

**The No-Lift Rule.** Nothing rises on hover. Interactive surfaces respond by
changing their border to emerald (`hover:border-primary`) or their text
(`hover:text-primary`). Elevation is reserved for things that are literally on
top of the page.

**The Stillness Rule.** `transition-colors` is the only transition the system
uses (138 usages against 2 `transition-all`). Movement is reserved for genuine
indeterminate progress — a spinner. The interface does not slide, scale, or bounce.

## Shapes

Three radii and nothing else:

- **10px — controls.** Buttons, inputs, select triggers, nav items, icon
  buttons. Anything you click or type into.
- **16px — panels.** Cards, tables, dialogs, empty states, sheets. Anything that
  contains. (Both `rounded-xl` and `rounded-2xl` resolve to 16px here, since
  `--radius-xl` is overridden to `calc(0.75rem + 4px)`.)
- **Full — chips and avatars.** Badges, status pills, count bubbles, initials
  avatars. Anything that labels or identifies.

Borders are the primary structural device, not shadow. Interactive strokes are
**1.5px** (`border-[1.5px]` on inputs, select triggers, secondary buttons);
structural strokes are 1px (panel edges, header rules). Table rows separate with
a 1px `#f1f5f9` hairline and the last row drops it.

### Named Rules

**The Three Radii Rule.** 10px if you touch it, 16px if it holds things, full if
it labels something. A fourth radius means the element has no clear job.

**The Thicker Stroke Rule.** Anything a user aims at gets a 1.5px border, so the
target reads as a target. Decorative and structural lines stay at 1px.

## Components

### Buttons

- **Shape:** gently rounded (10px), 40px tall by default (`h-10 px-5`), 48px at
  `lg` (`h-12 px-7`, 15px text), 36px at `sm`.
- **Primary:** emerald fill, white text, `shadow-sm`. Hovers to Deep Emerald
  (`#047857`). Exactly one per screen — the action the page exists for.
- **Outline:** white fill, 1px `#e2e8f0` border, Reading Grey text. On hover the
  border *and* text both go emerald. This is the workhorse secondary.
- **Ghost:** no fill at rest; hovers to the Emerald Wash with Deep Emerald text.
  Used for toolbar and row-level actions.
- **Destructive:** `#ef4444` fill, white text, hovers to 90% opacity.
- **Focus:** `ring-2 ring-ring ring-offset-2` — emerald ring, offset from the
  control. Never removed.
- **Disabled:** `opacity-50` with pointer events off.

### Inputs / Fields

- **Style:** 44px tall, white, 1.5px `#e2e8f0` border, 10px radius, 14px text,
  `px-3.5 py-2.5`.
- **Focus:** border goes emerald **and** a 3px `primary/15` halo appears — a
  two-signal focus state that survives bright gym lighting and low-quality
  screens.
- **Error:** `aria-invalid` flips the border to `#ef4444` and the halo to
  `destructive/15`. The message renders at 13px in `#ef4444`, wired via
  `aria-describedby` from the shared `Field` wrapper.
- **Placeholder:** Context Grey (`#64748b`).

### Cards / Containers

- **Corner:** 16px.
- **Background:** Paper on the Cool Ground (coach) or Aluno Ground (aluno).
- **Border:** 1px `#e2e8f0`.
- **Shadow:** Rest — `0 1px 8px rgba(15,23,42,0.05)`.
- **Padding:** 24px; header, content and footer share it with `pt-0` on the
  lower two so the vertical rhythm doesn't double up.
- **Title:** Space Grotesk 600, `leading-none`.

### Chips

- **Default:** Emerald Wash fill, Emerald Hairline border, Vital Emerald text,
  `px-3.5 py-1`, 13px, semibold, fully rounded.
- **Solid:** emerald fill, white text, 12px — for counts and emphatic states.
- **Soft:** `#dcfce7` fill, 10px uppercase with `0.08em` tracking — the eyebrow
  marker.
- **Catalog set:** `base` (indigo — platform data), `clinic` (emerald — the
  clinic's own), `neutral` (slate), `warn` (amber). All `px-2 py-0.5`, 12px.
  These four are a semantic set: they answer "whose row is this?"

### Navigation

- **Desktop rail:** 240px, white, 1px right border, logo at top with 32px of air
  beneath it. Items are 10px-radius rows, `px-3 py-2`, 14px medium in Reading
  Grey; hover fills with `#f8fafc`. The active item fills with Emerald Wash and
  its label and icon go Vital Emerald. `aria-current="page"` is set.
- **Active matching:** most-specific-wins — a nested route lights its own item,
  not its parent.
- **Badges:** a count bubble (emerald fill, white, 11px semibold) sits at the row
  end, capped at "9+", with an `aria-label` spelling out the real count.
- **Mobile (coach):** a 36px bordered menu button in the header opens a left
  `Sheet` carrying the same rail, plus a mark-only logo.
- **Mobile (aluno):** a fixed bottom bar; the active tab is marked by a 2.5px
  top border in emerald and emerald label, inactive by transparent border and
  Meta Grey.

### Tables

- **Head:** 12px semibold in Meta Grey, `px-4 py-3`, left-aligned, no fill.
- **Row:** 1px `#f1f5f9` bottom border, dropped on the last row.
- **Cell:** `px-4 py-3`, aligned middle, values at 13px in Reading Grey.
- Wrapped in a Paper panel at 16px radius with the Rest shadow, and always
  inside a `min-w-0` column. Driven by TanStack Table; below `md` the same data
  renders as the card stack described in **The Two Renderings Rule**.

### Signature: the Aluno Portal

A deliberate sub-world built from the same tokens with a different posture.

- **Ground:** Aluno Ground (`#eef1f5`) — a half-step cooler than the coach's.
- **Mobile header:** a solid Vital Emerald band with the aluno's initials in a
  `bg-white/20` circle, their name, their clinic, and a white pill for the
  active plan or goal. This is the one place a large emerald field is correct,
  and it is what makes the portal feel like *their* app rather than a stripped
  coach app.
- **Desktop:** a white 60px header, then a `[262px_1fr]` grid with a sticky
  profile card (68px emerald initials circle, name, coach, goal chip) above a
  nav panel — both Paper, 16px radius.
- **Bottom bar:** fixed, white, safe-area padded, `text-label` under 20px icons.

### Signature: the Billing Banner

A single full-width strip under the app header, `px-6 py-3`, 13px, with an
`AlertCircle` and a bordered "Assinar" button that opens the Pix dialog in place.
Three tones, one at a time, worst news first: **danger** (red-50 on red-200,
overdue fatura or expired trial), **warning** (amber-50 on amber-200, open
fatura), **info** (sky-50 on sky-200, trial running). It carries `role="status"`.
This is the only place in the app permitted to use a non-emerald, non-slate
surface at full width.

## Do's and Don'ts

### Do:

- **Do** use `0 1px 8px rgba(15,23,42,0.05)` for every resting panel, and
  `0 8px 40px rgba(15,23,42,0.15)` for anything genuinely floating. Nothing between.
- **Do** signal hover with `hover:border-primary` or `hover:text-primary`.
- **Do** give every listing two renderings — a table from `md` up, tappable cards
  below.
- **Do** put `min-w-0` on any column that can hold a table or user-supplied text.
- **Do** keep controls at 10px radius, panels at 16px, chips fully round.
- **Do** use 1.5px borders on anything the user aims at, 1px on structure.
- **Do** pair the focus border with the 3px `primary/15` halo — both signals, always.
- **Do** keep the aluno portal on its own ground (`#eef1f5`) with its emerald
  header and bottom tabs.
- **Do** write every label, button and message in Brazilian Portuguese, sentence
  case, using the product's own words (aluno, ficha, treino, dieta, anamnese).
- **Do** reserve uppercase for the 10px eyebrow with `0.08em` tracking.

### Don't:

- **Don't** lift, scale, or slide anything on hover. There is no `hover:shadow`
  and no `hover:translate-y` in this system, and there should not be a first one.
- **Don't** animate beyond color. `transition-colors` is the vocabulary; a
  spinner is the only motion that earns its place.
- **Don't** introduce a second accent color. If a screen needs one to work, the
  screen's hierarchy is wrong.
- **Don't** tint decorative elements emerald. Emerald describes the state of a
  real thing, never the importance of a box.
- **Don't** fill a large area with emerald. The aluno's mobile header is the
  single exception.
- **Don't** put more than one primary button on a screen.
- **Don't** add a fourth radius, a third font, or a shadow value that isn't Rest,
  Overlay, or Theatre.
- **Don't** use the Theatre shadow (`0 32px 80px /.25`) anywhere but the landing
  hero mockup.
- **Don't** let a table force horizontal page scroll — it scrolls inside its own
  container or it re-renders as cards.
- **Don't** reach for a neon-fitness look (dark grounds, lime gradients, italic
  condensed caps, hexagons) or a generic purple-SaaS template (mascots,
  illustration-heavy empty states, the same B2B hero as everyone else). Both are
  confirmed anti-references.
