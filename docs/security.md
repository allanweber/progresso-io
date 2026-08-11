# Security hardening

This document records how the findings from the static security assessment were
addressed. Each item links the change to the code that implements it. Two
findings (L-1, L-6) are **accepted, documented decisions** rather than code
changes — see the notes.

## High

### H-1 — Broken access control on student endpoints → **fixed**

Six coach-only handlers authenticated the session but omitted the role gate, so
an authenticated `aluno` could read/edit/archive/invite any clinic-mate via the
API (the DAL is clinic-scoped, so never cross-tenant — but still a clinic-local
IDOR). Added `if (ctx.role !== "coach") return forbidden();` immediately after
the auth guard in:

- `GET /api/students` (`src/app/api/students/route.ts`)
- `GET|PUT|PATCH|DELETE /api/students/[id]` (`src/app/api/students/[id]/route.ts`)
- `POST /api/students/[id]/invite` (`src/app/api/students/[id]/invite/route.ts`)

Every other `/api/students/**` sub-route (diet, workout, check-in, anamnesis,
evolution) already had the gate — verified during the fix.

Regression test: `tests/students-route-authz.test.ts` (aluno → 403, unauth → 401
on all six).

### H-2 — Auth rate-limiting bypassed by server actions → **fixed**

Better Auth's rate limiter runs as an `onRequest` hook on the mounted
`/api/auth/[...all]` handler, but every sensitive flow is a **server action**
calling `auth.api.*` directly, skipping that pipeline entirely. Added an
app-level limiter applied at each action boundary:

- `src/server/rate-limit.ts` — fixed-window `hit(key, max, windowMs)` + a
  proxy-aware `clientIp()`.
- Applied in `src/app/actions/auth.ts`: sign-in ≤ 10/min/IP, OTP verify ≤
  10/min/IP, reset ≤ 10/min/IP, sign-up ≤ 5/hour/IP, OTP sends 1/min/**email**
  **and** ≤ 5/hour/IP.
- Applied in `src/app/actions/contact.ts`: ≤ 5/hour/IP (anti-bombing).

Test: `tests/rate-limit.test.ts`.

## Medium

### M-1 — Security headers / CSP → **fixed**

`next.config.ts` now sets `poweredByHeader: false` and a global header block:
HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and a
CSP (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`,
`form-action 'self'`).

CSP note: `script-src`/`style-src` keep `'unsafe-inline'` because Next's App
Router streams inline bootstrap/hydration scripts and Tailwind emits inline
styles — a nonce-less strict policy breaks the app. GA hosts are added to
`script-src`/`connect-src` only when `NEXT_PUBLIC_GA_ID` is set. Future upgrade:
a middleware nonce pipeline to drop `'unsafe-inline'`.

### M-2 — PII (phone numbers) in logs → **fixed**

`src/lib/whatsapp.ts` masks numbers before logging (`maskPhone` → keeps last 4),
and the logger's redaction backstop (`src/server/observability/logger.ts`) now
also covers `phone`/`whatsapp` keys. `email`/`to`/`name` are intentionally left
readable (masked at source where a raw number would appear) — they're useful for
support correlation and are lower-sensitivity than a full phone/OTP/token.

### M-3 — `BETTER_AUTH_SECRET` not asserted → **fixed**

`createAuth` (`src/lib/auth.ts`) now throws at boot in production when the secret
is missing or shorter than 32 chars — fail fast instead of degrading session
signing silently (mirrors the `DATABASE_URL` guard in `src/db/index.ts`).

## Low

### L-1 — Account enumeration on sign-up / sign-in → **accepted, documented**

Sign-up surfaces `USER_ALREADY_EXISTS` under the e-mail field, and an unverified
sign-in redirects to `/verify-account` — both reveal whether an address is
registered. These are deliberate UX affordances: the "already have an account"
hint and the "confirm your code" redirect are important for a small-audience
coaching product, and the invite-accept flow relies on the same
`USER_ALREADY_EXISTS` signal. Password **reset** already avoids enumeration
(always returns success). Rate-limiting (H-2) blunts automated enumeration.
Decision: keep the current UX; revisit if the threat model changes.

### L-2 — Admin-delete TOCTOU + non-atomic accept flows → **fixed**

- Admin delete: `admin.deleteAdminAtomic` (`src/server/dal/admin.ts`) counts and
  deletes inside one transaction with the admin rows locked
  (`SELECT … FOR UPDATE`), so concurrent deletes can't both drop below the
  last-admin floor. Wired into `src/app/api/admin/admins/[id]/route.ts`. Test in
  `tests/admin-admins.integration.test.ts`.
- Accept flows: the post-sign-up provisioning (promote role, drop throwaway
  clinic, link student, mark invite accepted) now runs in a single
  `db.transaction` in both `invite/accept` and `admin-invitations/accept`, so a
  mid-flow error rolls back cleanly. (The `signUpEmail` call is a separate Better
  Auth call and can't join the transaction — the residual window is bounded to
  that one call.)

### L-3 — Admin-email account squatting → **mitigated**

The `ADMIN_EMAIL` sign-up is now promoted to admin **only when no admin exists
yet** (`src/lib/auth.ts` create hook). Once any admin exists — including ones
created via in-app invitations — that address no longer auto-elevates, so it
can't be used as a standing self-elevation vector. Test:
`tests/admin-bootstrap.integration.test.ts`.

### L-4 — Secrets in URL + pre-confirm disclosure → **fixed**

- Token-landing pages (`/invite/accept`, `/admin-invite/accept`, `/anamnesis/fill`)
  send `Referrer-Policy: no-referrer` (per-path override in `next.config.ts`), so
  the credential-bearing URL never leaks via `Referer`. Edge/proxy access-log
  scrubbing of query strings remains an infra-side task.
- **Pre-confirm minimization (anamnese fill):** `GET /api/anamnesis/fill` no
  longer returns the student's first name, phone-hint or the questionnaire — only
  `{ valid, clinicName, name }` (no personal data). The identity + questionnaire
  are withheld **server-side** until the WhatsApp number is confirmed, and are
  returned by `POST /api/anamnesis/fill/confirm` on a match. A leaked/forwarded
  fill link can no longer disclose who it's for. (`FillPageState` / `FillRevealDto`
  in `src/lib/student-anamneses.ts`.)

### L-5 — Auth defaults not pinned → **fixed**

`src/lib/auth.ts` now pins `trustedOrigins` (canonical prod origin), an explicit
7-day `session` policy, and `advanced.useSecureCookies` in production.

### L-6 — In-memory limiters don't scale across instances → **accepted, documented**

The auth/contact limiter (H-2) and the anamnese-fill limiter are in-memory: they
reset on deploy and aren't shared across replicas. This is a deliberate,
best-effort control for the current **single-instance** Dokploy deploy. A
horizontally-scaled deploy should back both with Redis/Postgres — the call sites
are unchanged, only the store swaps.

### L-7 — Contact-form `name` unbounded → **fixed**

`src/app/actions/contact.ts` now bounds `name` to `max(120)`.

### L-8 — Unpinned Docker images → **fixed** (redirect param kept)

- `Dockerfile` pins the Node base to an exact patch (`22.13.1-slim`, overridable
  via build-arg; prefer a sha256 digest once the deploy registry is fixed).
- `docker-compose.yml` pins `cloudflared` to a version (via
  `${CLOUDFLARED_VERSION:-…}`) instead of `:latest`.
- `src/proxy.ts` **retains** the `?redirect=` param. It looked dead (no page
  consumes it today) but it's part of the intended return-after-login flow and is
  asserted by `e2e/auth.spec.ts`; removing it is a behavior change, not a security
  fix. The param is only a risk if a future consumer redirects to it unsafely, so
  the guidance (documented at the call site) is: any consumer MUST treat it as
  untrusted and redirect only to a same-origin path, never an absolute URL.

## PII / GDPR data-return review

A pass over what personal & special-category data the APIs actually return.

**Verdict:** no unauthenticated, cross-tenant or cross-party leak of contact or
special-category (health) data. Special-category data — anamnese answers,
check-in weight/measurements/skinfolds, progress photos — is only ever returned
to the owning aluno or the clinic's coach, behind ownership joins; photo routes
prove clinic+student ownership before streaming bytes. The aluno portal
(`getMyProfile`) returns the coach's **name** only — never the coach's e-mail or
phone.

Changes made from this review:

- **Log redaction (PII):** the logger backstop now redacts `email` and personal
  names (`firstName`/`lastName`/`studentName`/`fullName`) in addition to phone —
  so a stray `logger.info("…", { email })` can't leak a data subject into the log
  stream. The bare key `name` is intentionally NOT redacted (it collides with
  `Error.name`, a diagnostic); personal names are logged under the `*name`
  variants, which are. Correlate by `userId`/`clinicId` instead.
- **Data minimization (student payload):** the student API responses drop the
  internal `clinicId`/`coachId`/`userId` FKs the client never uses (via
  `toStudentDto`); the account relationship the UI needs is still exposed through
  the derived `hasAccount` flag.
- **Pre-confirm minimization:** see L-4 above.

Accepted as-is: platform admins (`role = "admin"`) see cross-clinic student
contact data by design — that's a controller function, gated by
`getAdminSession()`. Coaches see their own students' full contact data (email,
phone, goal) — legitimate for the processor relationship.

## Verified-safe (unchanged)

Tenant isolation, admin-surface gating, token hashing/crypto, injection sinks,
mass-assignment and secrets handling were reviewed as sound in the assessment and
were left as-is.
