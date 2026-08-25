<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

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

# Frontend architecture (written in stone)

These apply to every feature, this one and the next. Existing auth pages predate the rules and are left as-is; new work follows them.

- **Pages are client components.** Page bodies are `"use client"`. Route protection still lives in the server-component **layout** (`requireRole` / `requireClinic`) — defense in depth — but the page itself is a client component.
- **All page↔backend traffic goes through API route handlers + TanStack Query.** No server actions for feature data. Pages read/write via `fetch` to `/api/*` inside `useQuery`/`useMutation`. Each route handler still validates every input with **zod** and derives the tenant via `requireClinic()` + the **DAL** — the API layer sits in front of those rules, it never bypasses them.
- **Sign-out clears all caches.** The logout control calls `queryClient.clear()` so no tenant data survives into the next account (see `dashboard-shell.tsx`).
- **All forms use TanStack Form** (`@tanstack/react-form`).
- **All tables use TanStack Table** (`@tanstack/react-table`).

# Screenshots: always from real, asserted tests — mobile and desktop

When asked for screenshots, **never** capture them with a throwaway,
assert-nothing spec. Screenshots must be a byproduct of a **real test in the
suite** that makes assertions about what's on screen. If no such test exists for
the screen, **write one and add it to the suite** (an e2e project / spec), then
return the screenshots it produced.

Every screenshot deliverable must cover **both mobile and desktop** viewports.
