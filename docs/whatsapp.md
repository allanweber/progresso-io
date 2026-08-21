# WhatsApp inbox (coach) + admin overview

The coach's WhatsApp surface at `/coach/whatsapp` — a two-pane inbox
(conversation list + chat) with the **24h customer-service window** and the
**pre-approved template** fallback baked in. It's a **paid-tier** feature (Free
excluded), gated exactly like the Calendar. The platform admin gets a per-tenant
overview at `/admin/whatsapp`, and the coach dashboard's "WhatsApp aguardando"
card is wired to real data.

Which WhatsApp vendor the app talks to is **deliberately undecided** — everything
runs behind a provider **port** so Meta Cloud API / Twilio / Z-API can be dropped
in later with no caller changes. Until one is wired, a `dev` provider logs and
never delivers, and inbound arrives through a guarded dev endpoint.

## The 24h window (the rule that shapes everything)

WhatsApp lets a business send **free-text** only inside a **24h window** that
(re)opens on each inbound message from the person. Outside it, only an
**approved template** may go out (this is also the rule for a first contact).

- The window is **never stored** as a flag — it's derived on every read from the
  conversation's `lastInboundAt`: `now − lastInboundAt < 24h` (`isWindowOpen` in
  `src/lib/whatsapp-inbox.ts`).
- The server **enforces** it: a free-text `POST` into a closed window is rejected
  with a friendly `422`; only an approved template is allowed there. The UI
  mirrors this (free-text composer when open; the red "Janela de 24h fechada — só
  templates pré-aprovados" banner + template buttons when closed), but the API is
  the source of truth, not the UI.

## Data model (migration `0028`)

Four clinic-scoped tables (`clinicId` is the tenant key; every query filters by
it via the DAL, `src/server/dal/whatsapp.ts`):

- **`whatsapp_conversation`** — one thread per `(clinicId, phone)`. Linked to a
  `studentId` when the number matches a student, else kept as an unknown-number
  thread (studentId null) so nothing inbound is lost. The denormalized `last*`
  columns (`lastInboundAt`, `lastMessageAt`, `lastMessagePreview`,
  `lastMessageDirection`, `unreadCount`) render the list cheaply. `lastInboundAt`
  is the window anchor.
- **`whatsapp_message`** — each message: `direction` (inbound/outbound), `type`
  (text/template), `body` (rendered), `templateKey`, `status`
  (queued/sent/delivered/read/failed), `providerMessageId`.
- **`whatsapp_template`** — the message catalog, **base + clinic** (migration
  `0029`): `clinicId` is **nullable**. A `NULL` row is an app-wide **base**
  template; a row with a `clinicId` is that clinic's **override** of the same
  `key`. Uniqueness is split — a partial unique index on `(key) WHERE clinic_id
  is null` (one base row per key) plus a unique index on `(clinic_id, key)` (one
  override per clinic per key). Each row has a stable `key` (e.g.
  `checkin_reminder`, used to correlate templates from code), a `title`, a
  `body` with `{nome}`/`{periodo}`/`{link}` placeholders, and an approval
  `status` (approved/pending/rejected, mirroring Meta's lifecycle); only
  `approved` rows can be sent. The base catalog (seven templates) lives in
  `drizzle/data/whatsapp-templates.json` — seed data like every other seed file —
  and is seeded **once globally** with `clinicId = null`. There is **no
  template-editor UI/CRUD yet** — the base+override shape is ready for a future
  per-clinic customization flow.
- **`whatsapp_connection`** — one row per clinic: `provider`, `status`
  (connected/pending/disconnected), display `phone`, `metaAccountName`,
  `connectedAt`. The home for real provider credentials later; powers the coach
  page's status dot and the admin overview.

### Apagar o aluno apaga o histórico (migração `0035`)

`whatsapp_conversation.student_id` cascades. Deleting an aluno deletes their
thread, and the messages go with it through
`whatsapp_message.conversation_id`, which already cascaded.

It was `ON DELETE SET NULL` until 0035, which was wrong twice over: the messages
are personal data that the erasure was supposed to remove, and the leftover
thread reappeared in the coach's inbox as a nameless conversation nobody could
act on. Note this applies to a **hard delete** only — archiving an aluno is a
status change and keeps everything.

The rule lives in the foreign key rather than in `hardDeleteStudent`, so no
delete path can forget it.

**Migration 0035 does not backfill.** A conversation with a null `student_id` is
also the legitimate state for an inbound from a number that never belonged to a
student, and after the fact nothing distinguishes the two. Any threads orphaned
before 0035 need a human to look at them.

No new plan-gate column — the inbox reuses the existing `plan_limit.whatsapp`
capability (`plans.canUseWhatsapp`), so Free is excluded and every paid plan is
included, with the per-clinic `clinic.whatsapp_override` still applying.

## Provider port (the abstraction)

`src/lib/whatsapp-provider.ts` defines `WhatsAppProvider`:

- `sendSessionMessage(to, body)` — free-text, valid only in an open window.
- `sendTemplateMessage(to, templateKey, renderedBody)` — a template, valid
  anytime.
- `parseInboundWebhook(payload)` → normalized inbound/status events.

`getWhatsAppProvider()` picks the implementation from `WHATSAPP_PROVIDER`
(unset/unknown → the `dev` provider, which logs and returns `delivered: false`,
so nothing breaks for lack of configuration). A real vendor becomes **one new
file + one `case`**, with zero caller changes. The onboarding helper
(`sendStudentOnboardingWhatsApp` in `src/lib/whatsapp.ts`, still used for the
anamnese-fill invite) routes through the same port, as does the template send
path (`sendTemplateToStudent`, below).

Because the dev provider can't confirm delivery, every outbound persists as
status **`sent`**; a real provider later upgrades it to delivered/read/failed via
status webhooks.

The provider's `canDeliver` flag (false for `dev`) is surfaced to the coach
inbox as `deliveryEnabled` and drives the **"WhatsApp em desenvolvimento —
mensagens não são entregues de verdade"** banner: it shows whenever no real
vendor is wired, so a coach on a live deploy with only the dev provider is never
left wondering why a message logged but didn't arrive. Wiring a real provider
(setting `WHATSAPP_PROVIDER` + implementing its adapter) flips `canDeliver` true
and the banner disappears. Note that actual delivery ALSO needs each clinic's
own connected number (`whatsapp_connection`), which the dev provider ignores.

## Templates: base + clinic resolution

One resolver is the single source of truth for "which template body does this
clinic send for `key`?", so the coach composer and every automation agree:

- **`resolveTemplate(ctx, key)`** — returns the clinic's own **approved** row for
  `key` if it has one, else the app-wide **base** (`clinicId is null`) approved
  row, else `null`. Used by `sendMessage` (composer) and `sendTemplateToStudent`
  (automations).
- **`listResolvedTemplates(ctx)`** — the effective catalog for a clinic: every
  base template with a clinic override merged in by `key`. Powers the composer's
  template picker (`GET /api/coach/whatsapp` → `templates`).

Both are clinic-scoped: a clinic never sees or sends another clinic's override.

### The base catalog (seven templates)

The base set is authored as data in `drizzle/data/whatsapp-templates.json` and
loaded by `@/server/whatsapp/base-templates` (`BASE_WHATSAPP_TEMPLATES`) for the
seed. Placeholders are filled by `renderTemplate` at send time —
`{nome}` (falls back to a neutral "aluno(a)"), `{periodo}` (the check-in cadence
fragment, from `CHECKIN_PERIODO[clinic.feedbackFrequency]` — "da semana / da
quinzena / do mês"), and `{link}`:

| key                 | when it fires                                   |
| ------------------- | ----------------------------------------------- |
| `checkin_reminder`  | scheduled reminder on the clinic's preferred day |
| `diet_published`    | coach publishes a diet version                  |
| `workout_published` | coach publishes a workout version               |
| `checkin_feedback`  | coach answers a check-in (manual note or feedback) |
| `welcome_access`    | portal access/invite sent to the student        |
| `anamnesis_welcome` | student registration — friendly welcome + fill invite |
| `anamnesis_reminder`| composer-only (nudge a still-pending anamnese)  |
| `session_confirm`   | composer-only (session confirmation)            |

### Sending a template to a student (`sendTemplateToStudent`)

`sendTemplateToStudent(ctx, studentId, key, vars, outboxKind?)` is the path every
**event automation** uses. It resolves the template (clinic → base), renders the
placeholders, sends via the port's `sendTemplateMessage`, and records the message
on the student's conversation (creating it if needed) as an **outbound template**
— so automated sends show up in the coach's inbox. Templates **bypass the 24h
window** (that's their purpose), and the send never touches `lastInboundAt` or
`unreadCount`. Returns `null` (a silent no-op) if the student has no phone or the
template can't be resolved. Any `{link}` is captured to the test-outbox so the
invite→accept e2e keeps working; `outboxKind` overrides that label (the welcome
send keeps the legacy `invite` kind).

## Event automations

The messages a clinic sends on its own behalf, all through the resolver above
(`src/server/whatsapp-automations.ts`):

- **In-request** (best-effort, plan-gated, never throw so they can't fail the
  coach's action): `notifyCheckinFeedback` (from the two check-in routes),
  `notifyDietPublished` / `notifyWorkoutPublished` (from the publish routes). The
  onboarding sends live in `src/server/onboarding.ts` and go through the same
  `sendTemplateToStudent` path: `sendAnamnesisInvite` → `anamnesis_welcome` (at
  registration) and `sendPortalInvite` → `welcome_access`. So **every** automated
  send lands in the coach's inbox as a conversation — there is no free-text
  onboarding path anymore.
- **Scheduled** — `runCheckinReminders(db?, today?)`: cross-tenant, session-less.
  For each clinic whose `feedbackPreferredDay` is `today` (and whose plan
  includes WhatsApp), it builds a per-clinic `TenantContext` attributed to the
  clinic owner, finds every active student with a phone who is **due or overdue**
  for a check-in (`computeCheckinDue`, from their own history + the clinic
  cadence), and sends `checkin_reminder`. It **coalesces**: a student already
  reminded within the current cadence period is skipped (query-based, no extra
  column), so an overdue student is nudged at most once per period rather than
  daily. Idempotent within a period.

  Triggered by **`POST /api/cron/whatsapp-reminders`**, guarded by a shared
  secret: `Authorization: Bearer $CRON_SECRET` (or `x-cron-secret`). With no
  `CRON_SECRET` set it only runs under the dev flag (`WHATSAPP_ALLOW_SIMULATE=1`)
  so it stays triggerable in testing; in production without a secret it refuses.

## Inbound: real webhook + the shared ingest path

Inbound messages (and the window re-opening) flow through **one** DAL function,
`ingestInboundMessage(ctx, { from, body })`: it finds-or-creates the conversation
by **normalized phone** (linking a student whose number matches — the student is
always derived from the phone, never passed in, exactly as production will),
appends the inbound message, sets `lastInboundAt = now` (reopening the window),
and bumps `unreadCount`.

It also raises a clinic-scoped **bell notification** (`whatsapp_received`) so the
coach is alerted — but **coalesced**: only when the conversation transitions
`0 → unread`. A rapid back-and-forth therefore rings once; once the coach opens
the thread (`unreadCount → 0`), the next inbound rings again. The payload is
denormalized (`contactName` — the student's name, or the formatted phone for an
unknown number — + a preview), and clicking it opens `/coach/whatsapp`.

- `POST /api/whatsapp/webhook` — the real provider webhook. Delegates to
  `provider.parseInboundWebhook`; inert until a vendor is configured (the `dev`
  provider parses nothing). Multi-tenant routing (mapping an event to a clinic via
  its `whatsapp_connection`) is wired when a provider is chosen. Public +
  unauthenticated by design; always answers 200. A `GET` handles Meta's
  `hub.challenge` verification handshake.

### Admin simulator (`/admin/whatsapp/simulator`)

Since no provider is wired, the **admin messaging simulator** is the way to
exercise a coach↔student conversation. It's a single self-contained page
(`src/app/admin/whatsapp/simulator/page.tsx` — delete the file and the feature
is gone), **admin-only** (`getAdminSession`), always available to platform
admins — **no env flag**. An admin picks any active student, sees their thread
with their coach, and sends messages **as that student**; each send runs the
same `ingestInboundMessage` path a real webhook would, so it lands in the owning
coach's inbox (`/coach/whatsapp`), and the coach's replies show back here. It's
linked from the admin WhatsApp overview (`/admin/whatsapp`) via a **"Simulador
de mensagens"** button.

### Simular mensagem recebida — coach dev endpoint

There's also a coach-scoped dev endpoint that injects an inbound message into
the **caller's own** clinic (the same `ingestInboundMessage` path):

`POST /api/whatsapp/dev/simulate-inbound`

- **Guard:** a plain `404` unless `WHATSAPP_ALLOW_SIMULATE === "1"` — this one is
  still opt-in behind the flag (it's coach-scoped, not the admin console). Still
  coach-only + plan-gated + tenant-scoped, so it can only write into the caller's
  own clinic.
- **Body:** `{ "phone": "+55 11 99999-0000", "body": "..." }` — **no `studentId`**
  (a real webhook only gives you the sender's number; the student is resolved by
  phone).

```bash
# 1) enable it (dev only)
export WHATSAPP_ALLOW_SIMULATE=1
pnpm dev

# 2) with a logged-in coach session cookie, simulate an inbound message:
curl -X POST http://localhost:3000/api/whatsapp/dev/simulate-inbound \
  -H "content-type: application/json" \
  -H "cookie: <your coach session cookie>" \
  -d '{"phone":"+55 11 99999-0000","body":"Cheguei, coach!"}'
# → 201 { "conversationId": "...", "windowOpen": true }
```

The e2e spec relies on the **seeded** conversations (both window states) rather
than this endpoint, so it needs no special env. In production the route is a
404 — there is no way to inject inbound without a real provider.

## API

All coach routes are coach-only, plan-gated (`canUseWhatsapp`), tenant via
`getTenantContext` + the DAL, every input zod-validated (`src/lib/whatsapp-inbox.ts`):

- `GET /api/coach/whatsapp` → the inbox: conversations (newest first) + templates
  + this clinic's connection.
- `GET /api/coach/whatsapp/[id]` → a conversation's full thread; opening it marks
  it read (`unreadCount → 0`).
- `POST /api/coach/whatsapp/[id]` → send `{ type: "text", body }` (open window
  only) or `{ type: "template", templateKey }` (approved templates, anytime).
  `{nome}` is substituted server-side from the linked student.
- `GET /api/admin/whatsapp` → the admin overview (admin-only, cross-tenant).

Read/written from the client through TanStack Query; the inbox and open thread
**poll every ~10s** (paused when the tab is hidden) so new inbound appears
without a manual refresh.

## Surfaces

- **`/coach/whatsapp`** — two-pane inbox: conversation list (name/preview/unread +
  window dot) and chat (bubbles, window badge, composer). Composer switches on the
  live window state. Responsive: two panes on desktop, list→thread drill-down on
  mobile. A Free coach hitting the route sees an upsell empty-state (the API
  answers 403). The "WhatsApp" nav item is hidden unless the plan includes it.
- **Coach dashboard** — the "WhatsApp aguardando" KPI + card list unanswered
  conversations (unread inbound), linking into the inbox. Not plan-gated chrome,
  but empty for a Free clinic (no conversations).
- **Sidebar badge** — the "WhatsApp" nav item carries a count badge of
  conversations awaiting a coach reply, polled from
  `GET /api/coach/whatsapp/waiting-count` (`whatsapp.countWaiting`, the uncapped
  count) every 30s (+ on focus) so it stays fresh across pages. Only queried for
  a coach whose plan includes WhatsApp; caps the label at "9+".
- **`/admin/whatsapp`** — platform-admin overview: KPIs (conectados, msgs este
  mês, janelas abertas, clínicas) + a per-tenant table (studio, número, status,
  msgs este mês, janelas abertas). Status + number come from each clinic's
  `whatsapp_connection`; the counts are computed live from the message /
  conversation tables.

## Files

- Schema: `whatsapp_conversation` / `whatsapp_message` / `whatsapp_template` /
  `whatsapp_connection`, migrations `0028_whatsapp_inbox` +
  `0029_whatsapp_base_templates` (templates → base + clinic override model).
- lib: `whatsapp-inbox.ts` (client-safe: enums, DTOs, 24h-window math, template
  rendering + `CHECKIN_PERIODO`, zod), `whatsapp-provider.ts` (the port + dev
  provider, with `canDeliver`).
- Seed data: `drizzle/data/whatsapp-templates.json` (base catalog), loaded by
  `src/server/whatsapp/base-templates.ts` for the dev seed **and** by
  `scripts/migrate.mjs` (`seedWhatsappTemplates`) on every deploy — so a
  production DB, which never runs the dev seed, still gets the base templates
  (without them no automation can build a message).
- DAL: `whatsapp.ts` (inbox/thread reads, `sendMessage` with window+template
  enforcement, `resolveTemplate` / `listResolvedTemplates`,
  `sendTemplateToStudent`, `ingestInboundMessage`, `listWaiting`,
  `getAdminOverview`).
- Automations: `src/server/whatsapp-automations.ts` (`notifyCheckinFeedback` /
  `notifyDietPublished` / `notifyWorkoutPublished` in-request helpers +
  `runCheckinReminders` scheduled job); welcome wired in `src/server/onboarding.ts`.
- API: `coach/whatsapp` (+`[id]`), `whatsapp/webhook`,
  `whatsapp/dev/simulate-inbound`, `admin/whatsapp`, `cron/whatsapp-reminders`
  (secret-guarded); `coach/dashboard` + the check-in/diet/workout routes extended
  to fire template automations.
- UI: `/coach/whatsapp` page + gated nav item, the dashboard "WhatsApp
  aguardando" widget, `/admin/whatsapp` page + admin nav item.
- Tests: `tests/whatsapp.test.ts` (window/template/schema units),
  `tests/whatsapp.integration.test.ts` (ingest, window enforcement, template
  approval, base+clinic resolution, `sendTemplateToStudent`, scheduled reminders,
  tenant isolation, read state, admin overview),
  `e2e/whatsapp.spec.ts` + `e2e/admin-whatsapp.spec.ts` (both viewports +
  screenshots).
