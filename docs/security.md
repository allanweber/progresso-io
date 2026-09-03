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
- Applied in `src/app/actions/contact.ts`: **1/day/IP**. Note this is a fixed
  window from the first message, not a calendar day, and that shared NAT (a
  clinic, an office, a mobile carrier) puts many real visitors on one budget —
  the refusal names the wait for exactly that reason. A window this long also
  leans harder on the in-memory store: every deploy hands every IP a fresh
  budget, so it only truly holds for a day once backed by Redis/Postgres.
  A failed send **refunds** the hit (`refund()` in `src/server/rate-limit.ts`) —
  the window keeps running, so failing on purpose is not a way to reset your own
  clock, but a Resend outage no longer locks a visitor out for 24h over a
  message that was never delivered.

Test: `tests/rate-limit.test.ts`.

### Contact form — automated submissions → **fixed**

The rate limit above bounds how *much* spam one source can send; it does not
tell a bot from a coach. `src/app/actions/contact.ts` adds three checks.

The one the visitor sees is **Cloudflare Turnstile** (`src/lib/turnstile.ts`) —
the "Não sou um robô" widget, verified server-side against Cloudflare's
siteverify endpoint. Turnstile rather than reCAPTCHA: no Google account, and no
cookie dropped on a visitor who has not answered the consent banner yet. It
needs two keys (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`) and
opens the CSP for `challenges.cloudflare.com` in `script-src`/`frame-src`, both
gated on the site key so an install without Turnstile keeps the tighter policy.

**Unset keys skip the check rather than refusing submissions** — the same shape
as every other optional integration — which is what keeps dev and e2e working
without a Cloudflare account, and is why the two invisible checks below are not
redundant. A skipped verification logs `turnstile.not_configured`, so a
production deploy that forgot the keys shows up in the logs and not just in the
spam. A Cloudflare outage also fails open, logged as `turnstile.verify_failed`:
refusing every message while their API is down is a worse failure than a few
minutes of spam.

The other two are invisible, cost the visitor nothing, and catch what Turnstile
structurally cannot — traffic that POSTs to the action without ever loading the
page or running a line of JS:

- **Honeypot** — a `website` field positioned off-screen, `aria-hidden` and
  `tabIndex={-1}`, so nothing but a script can fill it. Off-screen rather than
  `display:none`/`type=hidden`, which the simplest scrapers skip.
- **Fill clock** — a `renderedAt` stamp written by JS on mount; a submission
  returned inside 2s, or older than 12h, is treated as machine traffic. Skipped
  entirely when the field is absent, so scripting-off visitors still get
  through. Client-supplied and therefore forgeable — it is the second layer,
  not the first.

A tripped *invisible* trap returns the **same success screen a human gets**: an
explicit rejection is free tuning feedback for whoever is probing. The
submission is dropped and logged as `contact.bot_rejected`. A failed *Turnstile*
check is the opposite — it says so out loud, because a real visitor whose
challenge expired needs to be told to solve it again rather than left believing
a message was sent.

Tests: `tests/contact.test.ts` — both invisible traps, the Turnstile pass/fail/
skip paths, and the false-positive cases (slow human, no timestamp, empty
honeypot, Cloudflare unreachable). `e2e/content.spec.ts` covers the form end to
end with Turnstile unconfigured, which is how CI runs it.

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

`createAuth` (`src/lib/auth.ts`) throws in production when the secret is missing
or shorter than 32 chars — fail fast instead of degrading session signing
silently (mirrors the `DATABASE_URL` guard in `src/db/index.ts`).

The check is **skipped during `next build`** (guarded by
`NEXT_PHASE !== "phase-production-build"`): the production build runs with
`NODE_ENV=production` but the secret is a runtime-only env (set in the deploy
environment, not a build arg), so asserting during the build's page-data
collection would break the Docker build. At runtime (`node server.js`,
`NEXT_PHASE` unset) the guard still fires. Verified by reproducing the deploy
condition — `NODE_ENV=production` with no secret and no `.env.local` — and
confirming the build now completes.

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
`session` policy, and `advanced.useSecureCookies` in production.

**Session lifetime (deliberate, revisit if the threat model changes).** A
remembered sign-in — "Continuar conectado", checked by default — lasts **90
days**, renewed on use (`updateAge` 1 day), which is a product decision: coaches
and alunos open this from a phone that never closes its browser, and a login
prompt is the app failing them. The controls that make that acceptable: the
cookie is `httpOnly` + `sameSite=lax` + `Secure` in production, so it is not
readable from JS and does not ride cross-site; the session is a DB row, so
signing out (or deleting the user) kills it everywhere immediately rather than
waiting for an expiry; and anyone on a shared device can uncheck the box, which
issues the same session as a **browser-session cookie** with no expiry of its
own — gone when the window closes, never renewed. Sign-in with Google is always
remembered: the OAuth redirect carries no such flag.

### L-6 — In-memory limiters don't scale across instances → **accepted, documented**

The auth/contact limiter (H-2) and the anamnese-fill limiter are in-memory: they
reset on deploy and aren't shared across replicas. This is a deliberate,
best-effort control for the current **single-instance** Dokploy deploy. A
horizontally-scaled deploy should back both with Redis/Postgres — the call sites
are unchanged, only the store swaps.

### L-7 — Contact-form `name` unbounded → **fixed**

Every field is bounded, from one source: `CONTACT_LIMITS` in `src/lib/contact.ts`
— name 80, e-mail 80, message 200. The form applies them as `maxLength` and
shows the message counter; `sendContactMessage` re-checks the same numbers with
zod, because `maxLength` is an attribute in the visitor's browser and is absent
from anything POSTing straight at the action. They live in `@/lib/contact`
rather than next to the schema because a `"use server"` module may only export
async functions.

Tests: `tests/contact.test.ts` (over the limit refused per field, exactly at the
limit accepted).

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
