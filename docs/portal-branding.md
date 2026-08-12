# Branded clinic portal

A clinic on a paid plan can publish a **branded portal** at
`app.progresso.io/<slug>` — a public microsite plus a branded sign-in for its
alunos. Path-based (same origin), so there's no DNS, cookie, or Cloudflare work:
it ships entirely in the app.

## What it is

- **Microsite** (`app/[slug]/page.tsx`, public, server-rendered): the clinic's
  logo, name, headline, description, contact buttons (WhatsApp / Instagram /
  site), themed by an accent color, with an **"Área do aluno"** CTA.
- **Branded login** (`app/[slug]/entrar/page.tsx`, public): the clinic's
  branding beside the standard `LoginForm`. The slug is **purely branding** — the
  sign-in is unchanged and, on success, normal role-routing sends the user to
  their own home (aluno → `/student`, coach → `/coach`). An aluno from another
  clinic who signs in here still lands in their own portal.

## Data

Branding lives on the `clinic` row (migration `0022`): `portal_subdomain` (the
slug, already existed) plus `logo_key`, `headline`, `description`, `whatsapp`,
`instagram`, `site_url`, `accent_color` — all optional. The coach edits them in
**Configurações → Portal do aluno**; the logo uploads to the shared storage
primitive (R2, or the local `.uploads/` fallback in dev/e2e) and is served
publicly by slug at `/api/public/clinic/<slug>/logo`.

## Rules

- **Paid-plan gate.** Only solo / clínica / enterprise clinics may set a slug or
  branding (`canUseBrandedPortal`). The settings route rejects branding writes on
  a free plan, the logo route 403s, and the settings UI shows a locked/upsell
  state. A clinic that downgrades stops resolving (its microsite 404s).
- **Reserved slugs.** `RESERVED_SLUGS` blocks every top-level route segment (so a
  slug can't shadow `/login`, `/coach`, `/api`, …) plus platform/vanity names.
  **Adding a new top-level route means adding it to that list** — the microsite is
  a root `[slug]` catch-all, and static routes always win, so a colliding slug
  would be unreachable.
- **Public read is branding-only.** `getPublicClinicBySlug` /
  `getPublicLogoKeyBySlug` are the one deliberate non-tenant, pre-auth reads —
  they return only the clinic's own public profile (no students, no PII) and only
  for a published (paid + slug) clinic; unknown/reserved/free/downgraded slugs
  resolve to null (a 404).
- **No auth changes.** Same origin, so sessions and cookies are untouched.

## Routing note

The `[slug]` catch-all only matches otherwise-unmatched single-segment paths, so
`/coach`, `/login`, `/contact`, etc. are unaffected (static routes take
precedence). `/<slug>/entrar` is the branded login; everything else under the app
is unchanged.

## Tests

- Unit (`tests/clinic-branding.test.ts`): slug reserved-word + format validation,
  accent/URL formats, the WhatsApp/Instagram link normalizers, the plan gate.
- Integration (`tests/clinic-settings.integration.test.ts`): the public read
  resolves only for a paid clinic with a slug, exposes only branding, and stops
  when the clinic downgrades; unknown slug → null.
- e2e (`e2e/portal.spec.ts`): the seeded `studio-forja` microsite renders and
  links to the branded login; an unknown slug is a 404.
