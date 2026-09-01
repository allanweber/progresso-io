---
name: Progresso IO
description: A chart on a warm desk — white sheets lit from above, emerald reserved for what is alive.
colors:
  primary: "#059669"
  primary-deep: "#047857"
  primary-press: "#065f46"
  primary-hover: "#047857"
  primary-light: "#f0fdf4"
  primary-light-border: "#bbf7d0"
  foreground: "#1c1a18"
  text-secondary: "#57534d"
  muted-foreground: "#746f67"
  meta: "#746f67"
  background: "#ffffff"
  surface-light: "#f7f6f4"
  surface-sunken: "#efedea"
  ground: "#e3e1dd"
  ground-aluno: "#f0ede7"
  surface-dark: "#221f1d"
  surface-dark-mid: "#322e2b"
  border: "#e5e2de"
  border-light: "#efedea"
  border-strong: "#d9d5cf"
  destructive: "#c4392a"
  ok-bg: "#e4f4e9"
  ok-fg: "#186b3a"
  info-bg: "#e5edfc"
  info-fg: "#2a5cbf"
  warn-bg: "#faeeda"
  warn-fg: "#8a5712"
  danger-bg: "#fbe7e3"
  danger-fg: "#ae3826"
  neutral-bg: "#efedea"
  neutral-fg: "#57534d"
  base-bg: "#e9e9fb"
  base-fg: "#4338ca"
  # Categorical sets (see § Categorical Sets). Hue is the identifier here, not
  # brand voice — each lives in one module and never spreads.
  state-invited: "#1d4ed8"
  technique-giant: "#0d9488"
  technique-gvt: "#1d4ed8"
  technique-fs7: "#c026d3"
  technique-restpause: "#ea580c"
  technique-cluster: "#7c3aed"
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
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  figure:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.1
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
  caption:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
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
  window: "20px"
  chip: "9999px"
  sm: "8px"
spacing:
  panel-padding: "24px"
  panel-gap: "24px"
  control-gap: "10px"
  section-rhythm: "96px"
shadows:
  rest: "0 0 0 1px rgba(28,26,24,0.045), 0 1px 2px rgba(28,26,24,0.05), 0 8px 20px -8px rgba(28,26,24,0.12)"
  raised: "0 1px 3px rgba(28,26,24,0.05), 0 12px 28px -10px rgba(28,26,24,0.12)"
  window: "0 1px 3px rgba(28,26,24,0.05), 0 24px 56px -20px rgba(28,26,24,0.18)"
  overlay: "0 2px 6px rgba(28,26,24,0.06), 0 16px 48px -12px rgba(28,26,24,0.22)"
  theatre: "0 40px 90px -30px rgba(28,26,24,0.34)"
components:
  button-primary:
    backgroundColor: "{colors.primary-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "40px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.primary-press}"
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
    textColor: "{colors.primary-deep}"
    rounded: "{rounded.chip}"
    padding: "2px 10px"
  nav-item-active:
    backgroundColor: "{colors.primary-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design System: Progresso IO

## Overview

**Creative North Star: "A Ficha na Mesa" (The Chart on the Desk)**

Progresso IO looks like a chart lying on a warm, well-lit desk. The app itself is
a single rounded sheet floating on that desk; inside it, white panels are further
sheets, separated from the page by the light falling around them rather than by
a drawn rule. Information is dense but never crowded: a coach scanning fifty
alunos should find the one who slipped without reading a single word twice. The
chart metaphor is not decoration; it is the product's own vocabulary (ficha,
anamnese, evolução) made visual.

The neutrals are **warm greige, not cool slate**. Per swatch the difference is
tiny — red leads blue by four to ten points — and in aggregate it is the whole
personality of the product. Slate reads as a hospital intake counter. Greige
reads as a desk with a lamp on it. Progresso is a coach's practice, and a coach
is not a triage nurse.

Emerald is the one color with a job. It marks what is **alive** — an active
aluno, a published version, the current nav item, the field you are typing in.
Everything else is greige: near-black for what matters, mid-grey for context,
pale grey for the scaffolding that holds it together. The restraint is what makes
the emerald legible; a screen where everything is branded is a screen where
nothing signals.

The controls are built to be hit, not admired. Interactive borders are 1.5px,
inputs are 44px tall, the focus ring is a 3px halo you cannot miss. This is
equipment for a coach holding a phone in one hand at the gym and for an aluno on
a cheap Android in bad signal — both real, both designed for. And the system does
not move: colour transitions and a spinner are the entire motion vocabulary, and
there is no hover lift anywhere in the codebase. Stillness is the house style.

**Key Characteristics:**

- A floating app window (20px radius) on a warm desk, from `lg` up only
- Paper-white panels held by shadow, not by a border — 16px radius, no stroke
- Warm greige neutrals throughout; not one cool grey in the app
- Emerald as ink and edge, rarely as fill — under ~10% of any screen
- Space Grotesk for structure, DM Sans for reading; a two-font system with no third voice
- Sturdy controls: 1.5px borders, 44px inputs, an unmissable 3px focus ring
- Colour-only motion — the interface never rises, slides, or bounces
- Two postures on one token set: a desktop-first coach app and a phone-first aluno portal

## Colors

A warm greige system with a single emerald voice — calm, low-chroma, and
deliberately quiet everywhere except the one place that signals life.

### Primary

- **Vital Emerald** (`#059669`): the color of the live and the actionable. It
  marks state (`ativa`, `publicado`, `em dia`), the focus ring, and every
  interactive edge on hover and focus. It is a **large-text and non-text**
  pigment — see **The 18px Rule**.
- **Deep Emerald** (`#047857`): the resting fill of any filled control whose
  label is white and under 18px, **and** the ink for emerald text on a pale
  surface. Token: `--primary-deep` (`text-primary-deep` / `bg-primary-deep`).
  This is the primary button, the active nav pill, and the count bubble.
- **Pressed Emerald** (`#065f46`): the hover and pressed rung *under* a Deep
  Emerald fill — once a button rests at `#047857`, that value can no longer be
  its own hover. Token: `--primary-press`. White on it reads 7.68:1.
- **Emerald Wash** (`#f0fdf4`): the pale tint behind a default badge or a success
  panel. Never a page background.
- **Emerald Hairline** (`#bbf7d0`): the text-selection background, and the only
  place a mid-emerald edge is used at rest.

### Neutral

Every value below is warm. There is no cool grey in the app, and adding one is a
regression, not a variation.

- **Ink** (`#1c1a18`): body copy, headings, table values — everything the reader
  is actually here for. 17.35:1 on Paper.
- **Reading Grey** (`#57534d`): secondary prose, table cell values, the resting
  color of outline buttons and nav labels. The workhorse of dense screens.
  7.64:1 on Paper, 5.85:1 on the Desk.
- **Meta Grey** (`#746f67`): column headers, timestamps, nav group titles,
  "last activity" — the labels on the chart rather than the readings. It ships
  at 11–12px and therefore has to clear 4.5:1 on **both** surfaces it lands on:
  Paper (4.99:1) and Inset (4.62:1). The old cool slate-500 cleared Paper only,
  and would have failed on every sidebar label and table header the moment those
  moved onto Inset — which this system does. It does **not** clear the Desk
  (3.82:1) and does not have to: the Desk is the empty ground around the window
  and never carries text.
- **Paper** (`#ffffff`): every panel, card, table, input, and the content column.
  The surface the work sits on.
- **Inset** (`#f7f6f4`): the sidebar, a table head, a sunken well — anything
  recessed *inside* the app window. Token `--surface-light`.
- **Sunken** (`#efedea`): the deepest recess, and the neutral chip wash. Token
  `--surface-sunken`.
- **The Desk** (`#e3e1dd`): what the app window floats on, and the page
  background for surfaces that have no window (auth, marketing).
- **Aluno Ground** (`#f0ede7`): the aluno portal's ground, a half-step *warmer
  and lighter* than the coach's desk, so their app feels like a different room.
- **Divider** (`#e5e2de`): structural 1px edges — header rules, dividers.
- **Hairline** (`#efedea`): table row separators and the faintest internal
  divisions — visible only when you look for them.
- **Aim Stroke** (`#d9d5cf`): the 1.5px border on anything a user targets.
  Token `--border-strong`, aliased by `--input`.
- **Night** (`#221f1d`) / **Night Mid** (`#322e2b`): the dark surfaces for the
  landing product mockup and the dark theme's card layer. Warm-black, so they
  belong to the same room as everything else.

### Tertiary

Status pigments, used only inside chips and banners — never as a surface larger
than one. Each is a **pale wash carrying a darkened ink of the same hue**, and
every pair is verified at ≥5:1 because chip text ships at 11–12px, where a pure
pigment on its own wash lands near 3:1 and fails the small-text floor.

| Role | Wash | Ink | Ratio | Means |
| --- | --- | --- | --- | --- |
| `ok` | `#e4f4e9` | `#186b3a` | 5.75:1 | a finished good outcome |
| `info` | `#e5edfc` | `#2a5cbf` | 5.28:1 | in flight, nothing wrong |
| `warn` | `#faeeda` | `#8a5712` | 5.30:1 | needs attention soon |
| `danger` | `#fbe7e3` | `#ae3826` | 5.20:1 | wrong now |
| `neutral` | `#efedea` | `#57534d` | 6.54:1 | a fact with no state |
| `base` | `#e9e9fb` | `#4338ca` | 6.59:1 | platform catalog data |

**Destructive** (`#c4392a`) is the fill and ink for a genuinely destructive
action and for field errors. It replaced `#ef4444`, which was both a cool
pigment on a warm ground *and* an accessibility defect: white on `#ef4444` is
3.76:1, and this document used to prescribe it for 13px error messages and
white-label destructive buttons. `#c4392a` reads 5.29:1 in both directions.

### Categorical Sets

Three places encode *which thing this is* rather than *how it is doing*. These
are the only sanctioned multi-hue palettes in the product, they live in one
module each, and none may spread beyond it.

- **Student state** (`STUDENT_STATE_STYLES`, `src/lib/students.ts`) — four pairs
  for `ativo` / `inativo` / `convidado` / `arquivado`.
- **Aluno avatars** (`AVATAR_PALETTE`, `src/lib/students.ts`) — eight wash/ink
  pairs hashed from the student id, so a person keeps one colour everywhere.
  This set encodes *identity*, not state, which is why it is built from the chip
  vocabulary (pale wash, darkened ink, ≥4.5:1) rather than from saturated fills
  with white letters, and why **emerald, red and amber are excluded**: an avatar
  must never borrow a pigment that means "alive", "wrong" or "overdue". Guarded
  by a unit test in `tests/students.test.ts`. **Do not convert these to
  saturated fills** — that was tried, and not one of the eight cleared AA.
- **Workout techniques** (`WORKOUT_TECHNIQUES`, `src/lib/workout-techniques.ts`)
  — eight hues identifying a prescription technique (bi-set, giant set, GVT,
  FS7, rest-pause, cluster…). The hue *is* the identifier a coach learns, the
  same way a map legend works; collapsing them to emerald would delete the
  information. Always paired with a label or icon, never colour alone.

### Named Rules

**The Warm Ground Rule.** Every neutral in this product is warm. Tailwind's own
`slate`, `gray` and `zinc` families are cool and must not appear in `src`; its
`red`, `sky` and `blue` families are cool and are replaced by the chip pairs
above. A cool grey on a greige ground does not read as a different grey — it
reads as a foreign object pasted over the app. Verify with:

```bash
grep -rnE "\b(bg|text|border)-(slate|gray|zinc|red|sky|blue)-[0-9]{2,3}\b" src --include=*.tsx
```

Two `dark:`-only hits (`bg-blue-950`, `bg-red-950`) remain and are the known
exception; anything else in light mode is a regression.

**The One Voice Rule.** Emerald is the only chromatic voice in the interface.
Every other color in a coach or aluno screen is greige, or a status pigment
confined to a chip or a banner. If a screen needs a second accent to work, the
screen is wrong, not the palette.

The exception is **categorical encoding**, above: where hue carries information
the reader must distinguish, a multi-hue set is doing a job emerald cannot do,
and it is confined to its own module.

**The Alive Rule.** Emerald describes the *state of a real thing*, not the
importance of a UI element. An active aluno, a published version, the tab you
are on, the input you are in. It never tints a section header, an icon that is
merely decorative, or a background that means nothing.

**The 18px Rule.** Vital Emerald is a *large-text and non-text* pigment. It
reads **3.77:1 on Paper** — fine for a 30px figure, an icon or a border (all
judged at 3:1), and a WCAG AA failure for anything smaller that is meant to be
read. White on a Vital Emerald fill is the same failure inverted.

So: at 18px and above, or for a shape rather than a word, use `#059669`. Below
it, in either direction, use Deep Emerald — `text-primary-deep` on a pale
surface (**5.48:1** on Paper, **5.08:1** on Inset) or `bg-primary-deep` under
white (**5.48:1**).

This is enforced through the shared primitives: `Button`'s default variant,
`Badge`'s `solid` variant and the **active nav pill** all rest at
`bg-primary-deep` and hover to `bg-primary-press`.

**The Two Grounds Rule.** `#e3e1dd` is the coach's desk; `#f0ede7` is the
aluno's room. A surface never sits on the wrong one. That half-step of warmth is
the entire signal that says which app you are in — and the direction is
deliberate: the coach's ground is the working one, the aluno's is lighter and
softer because they are at home on a phone, not at a desk.

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
- **Figure** (700, 30px, `tabular-nums`): a counted quantity read as a shape
  rather than as prose — the coach dashboard's KPI numerals. It outranks the
  Headline on purpose: the number *is* the content of its tile, and the label
  above it is the caption. Never used for a word.
- **Title** (600, 18px): panel and card titles, dialog titles.
- **Subtitle** (600, 15px, Space Grotesk): the name of a section *inside* a
  panel or dialog. Subordinate to the Title above it and unmistakably above Body.
- **Body** (400, 14px, 1.6): the default. Descriptions, prose, form values,
  button labels, nav items. Keep marketing prose to a `max-w-[460px]`–
  `max-w-[560px]` measure; app prose is bounded by its panel.
- **Body Dense** (400, 13px): table cells, list-row metadata, secondary values
  inside a card. The single most-used size in the app after `body`.
- **Label** (600, 12px): field labels, column headers, chip text.
- **Caption** (400, 11px): the annotation layer — a definition-list key, a unit
  suffix, a nav group title, a count bubble, a calendar day header. The smallest
  size still meant to be *read*, usually in Meta Grey.
- **Eyebrow** (700, 10px, `0.08em`, uppercase): the small tag above a feature
  title, and the "Diferencial" / "Mais usado" markers. Uppercase is reserved for
  this one role.

### Named Rules

**The Two Voices Rule.** Space Grotesk sets structure — page titles, panel
titles, numbers a coach reads at a glance. DM Sans carries everything meant to be
read as language. There is no third font, and no role that uses both.

**The Uppercase Licence.** Uppercase appears only in the 10px eyebrow with
`0.08em` tracking. Buttons, labels, headings, nav items and **nav group titles**
are sentence case, in Portuguese, always. A group title in the rail is a filing
label on a drawer you are scanning past; shouting it would make the rail's
quietest text its loudest.

**The Named Rung Rule.** Every size in the app comes from a named `text-*`
utility, registered in `globals.css` under `@theme inline`. Verify with:

```bash
grep -rn "text-\[[0-9.]*px\]" src --include=*.tsx
```

**Known gap — 20 hits, all above the ramp.** Auth and marketing headings invent
22 / 26 / 28 / 32px, and marketing prose invents 15 / 17px, because the ramp
stops at Headline (24px) and jumps straight to Display (38–60px). There is no
rung for "a page title on a page that is not an app screen". The escapes are a
symptom of that missing rung, not of carelessness — **do not silently round them
to 24px**; either add the rung and migrate all twenty, or leave them. Adding a
twenty-first escape is the regression.

**The Two Postures Rule.** The ramp is one system read at two distances. The
coach's is the default — desk density, a fifty-row roster. The aluno's is
`.posture-reading`, which redefines `--fs-body-dense`, `--fs-body` and
`--fs-subtitle` one rung up (14 / 15 / 16) for a phone held at arm's length in
a gym. The structural rungs hold in both, so hierarchy is identical and only
what you *read* grows. This is why the utilities are declared `@theme inline`:
the value resolves at the element, not at `:root`, so a subtree can shift the
whole ramp with three custom properties and no prop threading. A dialog portals
to `<body>` and leaves that subtree, so it carries `posture-reading` itself.

**No Synthetic Bold.** The vendored variable faces carry Space Grotesk 400–700
and **DM Sans 400–600**. `font-bold` on body text asks for a 700 DM Sans that is
not in the file, and the browser smears a fake one — visible on exactly the cheap
Android the aluno portal is built for. Body text tops out at `font-semibold`;
700 belongs to `font-heading`.

## Layout

### The Window

From `lg` up, the coach and admin shell insets itself by 12px and becomes a
**single rounded sheet** (`rounded-window`, `shadow-window`) floating on the
Desk. That frame is what makes every panel inside it read as paper rather than
as more chrome — without it, a borderless white panel on a white page has
nothing to be a sheet *of*.

Below `lg` the frame is dropped entirely. On a 390px phone those gutters cost 6%
of the width to say something the phone already says by filling the screen, and
PRODUCT.md makes that width a correctness requirement, not a taste one.

Both layers use `min-h-screen`, never `h-screen` with an inner scroller: the page
keeps ordinary document scrolling, so the window grows with a fifty-row roster
instead of trapping it in a nested scroll container.

### The Rail

A 240px sidebar on **Inset**, from `md` up, becoming a header-triggered drawer
(`Sheet`, side left) below it. It carries **no right border** — the rail is Inset
and the content column is Paper, and that half-step of tone separates them more
calmly than a drawn rule. Adding both would be saying it twice.

Items are grouped into titled runs. Ten flat links is a list you re-read every
time; four titled runs of two or three is a place you learn. The coach's titles
name what they are *doing* — Atendimento, Prescrição, Acervo — which is also how
they describe their own week. The opening run (Visão geral) has no title because
it sits directly under the logo and needs none.

The content column is explicitly `min-w-0` so a wide table scrolls inside its own
container instead of forcing horizontal overflow on the page. Page content is
centered in a container sized to its density: `max-w-2xl` to `max-w-3xl` for
forms and detail views, `max-w-5xl` to `max-w-6xl` for listings and dashboards.

### The Aluno Portal

Phone-first: a 60px white header appears only from `lg`, while below it a solid
emerald header carries the aluno's avatar, name and clinic, and a fixed bottom
tab bar handles navigation with
`pb-[calc(0.7rem+env(safe-area-inset-bottom,0))]` so it clears the home
indicator. From `lg` the layout becomes `grid-cols-[262px_1fr]` with a sticky
profile card and nav panel on the left. Container is `max-w-[1180px]`. The portal
has **no window frame** — it is a phone app, and a floating desk sheet would be a
desktop metaphor imposed on a phone.

### Rhythm

Panels pad at 24px (`p-6`) and separate at 24px (`gap-6`). Within a panel,
related controls sit 10px apart, groups 20px. Page title to first panel is 24px.
Table cells are `px-4 py-3`.

**Page gutters** are 16px below `sm` and 24px from `sm` up. **Touch targets** in
the coach header are 44px below `sm` and may relax to 36px above it, where a
pointer is doing the aiming. **The header's height is a token**, `--header-h`
(73px, 65px from `sm`), because the notification dropdown pins itself to the same
number.

**Breakpoints** are Tailwind defaults: `sm` 640px, `md` 768px, `lg` 1024px.
`lg` now carries the window frame, `md` the rail, and `sm` most of the rest.

### Named Rules

**The Two Renderings Rule.** A data listing ships twice: a `<Table>` from `md`
up, and a stack of tappable cards below it — same data, different shape, not a
squeezed table. Every roster, catalog and history view follows this.

**The min-w-0 Rule.** Any flex or grid child that can contain a table, a long
name, or user text carries `min-w-0`. Horizontal page scroll is a defect, not a
tradeoff.

## Elevation & Depth

**Structure is carried by shadow first and border second.** This inverts the
system that came before, where a 1px stroke drew every panel and the shadow was
a 5%-opacity whisper. A panel is now a sheet of paper: it is separated from the
page by the light falling around it.

Every shadow is real — an offset *and* a soft blur — and built in two layers: a
tight contact shadow that seats the sheet on the ground, plus a wide diffuse one
that gives it height. One layer alone reads as a sticker. The pigment is
warm-black `rgba(28,26,24,α)`; a cool shadow on a greige ground reads as grime.

### Shadow Vocabulary

Five values, registered as utilities in `globals.css` under `@theme inline`.
There is **no arbitrary `shadow-[...]` anywhere in `src`** — 196 of them were
replaced by these names, which is what lets the dark theme flatten elevation in
one place instead of 196.

- **`shadow-rest`** — every panel, card, table container, empty state and auth
  card. The single resting elevation, used 184 times. It opens with a
  `0 0 0 1px` contact ring at 4.5% because a borderless white panel on a white
  content column needs an edge as well as a shadow; that ring *is* the panel's
  border, spent as light rather than as a stroke.
- **`shadow-raised`** — one step up, for a surface that is meaningfully above its
  neighbours without floating.
- **`shadow-window`** — the app window itself. One element.
- **`shadow-overlay`** — dialog, sheet, select content, popover, the notification
  dropdown and transient toasts: anything genuinely floating above the page.
- **`shadow-overlay-up`** — the same weight cast upward, for a surface anchored
  to the bottom of the viewport where a downward shadow falls off-screen. A
  direction change, not a sixth tier.
- **`shadow-theatre`** — the landing hero's product mockup only. A marketing
  device, never permitted inside the app.

Verify the vocabulary is intact:

```bash
grep -rn "shadow-\[" src --include=*.tsx          # must be empty
grep -rho "shadow-[a-z-]*" src --include=*.tsx | sort | uniq -c
```

**On night there is no light to fall.** `--elev-rest`, `--elev-raised` and
`--elev-window` degrade to a 1px inset ring in the `.dark` block, and elevation
is carried by the surface value (`--card` sits above `--background`) instead.
Only the genuinely floating tiers keep a shadow, deeper and tighter. This is the
entire reason elevation is a token and not a literal.

### Named Rules

**The No-Lift Rule.** Nothing rises on hover. Interactive surfaces respond by
changing their border to emerald (`hover:border-primary`) or their text
(`hover:text-primary`). Elevation is reserved for things that are literally on
top of the page.

**The Stillness Rule.** `transition-colors` is the only transition the system
uses. Movement is reserved for genuine indeterminate progress — a spinner. The
interface does not slide, scale, or bounce. `scroll-smooth` on `<html>` is
guarded by `prefers-reduced-motion` in `globals.css`; the guard is deliberately
narrow, since colour transitions move nothing and killing the spinner would read
as frozen rather than as calm.

## Shapes

Four radii and nothing else:

- **10px — controls.** Buttons, inputs, select triggers, nav items, icon
  buttons. Anything you click or type into.
- **16px — panels.** Cards, tables, dialogs, empty states, sheets. Anything that
  contains.
- **20px — the window.** Exactly one element, app-wide. It has to outrank the
  16px panels sitting inside it or the nesting reads as an accident.
- **Full — chips and avatars.** Badges, status pills, count bubbles, initials
  avatars. Anything that labels or identifies.

Borders are now the *secondary* structural device. Interactive strokes are
**1.5px** (`border-strong` on inputs, select triggers, secondary buttons);
structural strokes are 1px and increasingly rare — a panel has none. Table rows
separate with a 1px `--border-light` hairline and the last row drops it.

### Named Rules

**The Four Radii Rule.** 10px if you touch it, 16px if it holds things, 20px if
it is the window, full if it labels something. A fifth radius means the element
has no clear job.

**The Thicker Stroke Rule.** Anything a user aims at gets a 1.5px
`--border-strong`, so the target reads as a target. Structural lines stay at 1px,
and a panel gets none at all — its edge is the contact ring inside `shadow-rest`.

## Components

### Buttons

- **Shape:** gently rounded (10px), 40px tall by default (`h-10 px-5`), 48px at
  `lg` (`h-12 px-7`, 15px text), 36px at `sm`.
- **Primary:** Deep Emerald fill (`#047857`), white text. Hovers to Pressed
  Emerald (`#065f46`). Exactly one per screen — the action the page exists for.
- **Outline:** white fill, **1.5px** `--input` border, Reading Grey text. On
  hover the border *and* text both go emerald. This is the workhorse secondary,
  and it is a target, so it takes the aim stroke.
- **Ghost:** no fill at rest; hovers to the Emerald Wash with Deep Emerald text.
  Used for toolbar and row-level actions.
- **Destructive:** `#c4392a` fill, white text (5.29:1), hovers to 90% opacity.
- **Focus:** `ring-2 ring-ring ring-offset-2` — emerald ring, offset from the
  control. Never removed.
- **Disabled:** `opacity-50` with pointer events off.

### Inputs / Fields

- **Style:** 44px tall, white, 1.5px `--input` border, 10px radius, 14px text,
  `px-3.5 py-2.5`.
- **Focus:** border goes emerald **and** a 3px `primary/15` halo appears — a
  two-signal focus state that survives bright gym lighting and low-quality
  screens.
- **Error:** `aria-invalid` flips the border to `--destructive` and the halo to
  `destructive/15`. The message renders at 13px in `--destructive`, wired via
  `aria-describedby` from the shared `Field` wrapper.
- **Placeholder:** Meta Grey (`#746f67`).
- **Caret:** Deep Emerald, set globally in `globals.css`.

### Cards / Panels

- **Corner:** 16px.
- **Background:** Paper.
- **Border:** none. The edge is the `0 0 0 1px` contact ring inside `shadow-rest`.
- **Shadow:** `shadow-rest`.
- **Padding:** 24px; header, content and footer share it with `pt-0` on the
  lower two so the vertical rhythm doesn't double up.
- **Title:** Space Grotesk 600, `leading-none`.

The one exception is a **nested container** — a panel inside a panel, which gets
a 1px `--border` and no shadow, because two stacked shadows read as a mistake.
Nine of these exist and they are the whole permitted set.

### Chips

One shape — a fully rounded pill at `px-2.5 py-0.5`, 12px semibold, **no border**
— and one construction: a pale wash carrying a darkened ink. The border is gone
on purpose: a wash plus a mid-tone edge plus dark ink is three signals for one
fact, and the wash alone reads faster in a fifty-row table while stopping a
column of chips from looking like a column of buttons.

Variants are semantic, not decorative: `default` (emerald — alive), `ok`, `info`,
`warn`, `danger`, `neutral`, `base` (platform data), `clinic` (the clinic's own),
`solid` (Deep Emerald fill for an emphatic count), `soft` (the 10px uppercase
eyebrow marker).

### Navigation

- **Desktop rail:** 240px, Inset, **no right border**, logo at top padded to line
  up with the nav icons. Items are 10px-radius rows, `px-3 py-2`, 14px medium in
  Reading Grey; hover fills with `--secondary` and darkens the text to Ink.
- **Group titles:** 11px medium Meta Grey, sentence case, `px-3`, 6px above the
  first item and 20px above the group. Never uppercase — see **The Uppercase
  Licence**.
- **The active item is a solid Deep Emerald pill with white text.** Not a pale
  wash. Where you are is the one fact the rail exists to state, and at ten items
  a tint is something you hunt for. `aria-current="page"` is set.
- **Active matching:** most-specific-wins — a nested route lights its own item,
  not its parent.
- **Badges:** a count bubble at the row end, capped at "9+". Deep Emerald fill on
  an inactive row; `bg-white/20` on the **active** row, where an emerald fill on
  an emerald fill would vanish. The real count ships as `sr-only` text beside an
  `aria-hidden` numeral — never as an `aria-label` on the span, which maps to
  `role="generic"` and cannot carry a name.
- **Mobile (coach):** a 44px bordered menu button in the header opens a left
  `Sheet` carrying the same grouped rail, plus a mark-only logo.
- **Mobile (aluno):** a fixed bottom bar; the active tab is marked by a 2.5px top
  border in emerald and an emerald label, inactive by transparent border and Meta
  Grey.

### Tables

- **Head:** 12px semibold in Meta Grey, `px-4 py-3`, left-aligned, **no fill**.
- **Row:** 1px `--border-light` bottom border, dropped on the last row.
- **Cell:** `px-4 py-3`, aligned middle, values at 13px in Reading Grey.
- Wrapped in a Paper panel at 16px radius with `shadow-rest`, and always inside a
  `min-w-0` column. Driven by TanStack Table; below `md` the same data renders as
  the card stack described in **The Two Renderings Rule**.

### Browser Surfaces

The parts we did not draw still carry the design, and they are themed in
`globals.css`: text **selection** is Emerald Hairline on Pressed Emerald, the
**caret** is Deep Emerald, **scrollbars** are a full-radius `--border-strong`
thumb on a transparent track that darkens to Meta Grey on hover, **underline
offset** is `0.2em`, and `body` carries `font-variant-numeric: tabular-nums`
because every numeral in this product is a measurement someone compares against
another measurement.

### Signature: the Billing Banner

A single full-width strip under the app header, `px-4 py-3` (`sm:px-6`), 13px,
with an `AlertCircle` and a bordered "Assinar" button that opens the Pix dialog
in place. Three tones, one at a time, worst news first: **danger** (fatura
overdue or trial expired), **warning** (fatura open), **info** (trial running) —
each drawn from the chip pairs, not from Tailwind's palette. It carries
`role="status"`, has **no border** (the wash separates it), and the icon inherits
the tone's ink rather than carrying a second, brighter rung of the same hue.
This is the only place in the app permitted to use a status wash at full width.

## Do's and Don'ts

### Do:

- **Do** hold panels with `shadow-rest` and no border; the contact ring inside it
  is the edge.
- **Do** keep every neutral warm. Reach for a token, never for `slate`/`gray`.
- **Do** use the six chip pairs for status, and nothing else.
- **Do** signal hover with `hover:border-primary` or `hover:text-primary`.
- **Do** give every listing two renderings — a table from `md` up, tappable cards
  below.
- **Do** put `min-w-0` on any column that can hold a table or user-supplied text.
- **Do** keep controls at 10px radius, panels at 16px, the window at 20px, chips
  fully round.
- **Do** use 1.5px `--border-strong` on anything the user aims at.
- **Do** pair the focus border with the 3px `primary/15` halo — both signals,
  always.
- **Do** write every label, button and message in Brazilian Portuguese, sentence
  case, using the product's own words (aluno, ficha, treino, dieta, anamnese).
- **Do** reserve uppercase for the 10px eyebrow with `0.08em` tracking.

### Don't:

- **Don't** put a border on a panel that already has `shadow-rest`. Nested
  containers get a border *instead of* a shadow, never as well.
- **Don't** introduce a cool grey, a cool red, or a cool blue. There is not one
  in light mode and there should not be a first.
- **Don't** write an arbitrary `shadow-[...]`. Five names cover the system; a
  sixth value means the element has no clear height.
- **Don't** lift, scale, or slide anything on hover.
- **Don't** animate beyond color. `transition-colors` is the vocabulary; a
  spinner is the only motion that earns its place.
- **Don't** introduce a second accent color. If a screen needs one to work, the
  screen's hierarchy is wrong.
- **Don't** tint decorative elements emerald, or fill a large area with it. The
  aluno's mobile header is the single exception.
- **Don't** put more than one primary button on a screen.
- **Don't** convert the aluno avatars to saturated fills with white letters. That
  was tried; not one of the eight cleared AA.
- **Don't** give the window frame to the aluno portal, or to a phone. It is a
  desk metaphor and it belongs on a desk.
- **Don't** add a twenty-first `text-[Npx]` escape. Either add the missing rung
  above Headline and migrate all twenty, or leave them alone.
- **Don't** let a table force horizontal page scroll — it scrolls inside its own
  container or it re-renders as cards.
- **Don't** reach for a neon-fitness look (dark grounds, lime gradients, italic
  condensed caps, hexagons) or a generic purple-SaaS template (mascots,
  illustration-heavy empty states, the same B2B hero as everyone else). Both are
  confirmed anti-references.
