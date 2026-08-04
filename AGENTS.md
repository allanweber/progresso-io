<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

# Components: don't extract single-use components

Keep markup inline where it is used. Only split something into its own component when it is **reused in more than one place** or when a **technical boundary requires it** (e.g. a `"use client"` island inside a Server Component page). Do not create a component just to organize a one-off chunk of JSX — inlining is preferred over granular indirection.

# Routes: always in English

The UI copy is in Brazilian Portuguese, but route segments/URLs must be in **English** (e.g. `/register`, `/forgot-password` — not `/registro`, `/esqueci-a-senha`).

# Tenancy: the clinic is the tenant (non-negotiable)

Every coach and aluno belongs to exactly one **clinic** — a solo coach still owns a one-member clinic; the `Clínica` plan lets multiple coaches share one. `clinicId` is THE tenant key. Only platform admins (`role = "admin"`) live outside any clinic.

Every domain row carries a `clinicId`, and **every query is scoped by it**. The `clinicId` is always derived from the authenticated session (`requireClinic()`), **never** from client input.

# Validation: zod on every input (written in stone)

Every server action and route handler **MUST** validate all external input (`FormData`, search params, JSON bodies, headers) with **zod** before using it. No exceptions.

- Define a zod schema; parse with the `parseForm` helper in `@/lib/validation` (or `schema.safeParse`).
- On failure, return a friendly PT-BR message — do not proceed with unvalidated data.
- Validating shape is not authorization: still derive identity/tenant from the session, never from the validated payload.

# Data Access Layer: all DB access goes through the DAL (written in stone)

All database access for tenant data **MUST** go through the DAL in `src/server/dal/*`. Do **not** import `db` and query tenant tables directly from components, server actions, or routes.

- Every DAL function takes a `TenantContext` (`{ db, clinicId, userId, role }`) and scopes **every** query by `ctx.clinicId`. See `src/server/dal/students.ts` as the reference.
- Get the context with `requireClinic()` from `@/server/tenant`.
- The only exceptions are bootstrap operations that create the tenant itself (e.g. clinic creation at sign-up) and Better Auth's own tables, which Better Auth manages.
- When you add a feature table, add a matching DAL module in the same shape — never inline tenant queries.
