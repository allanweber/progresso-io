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
- **`whatsapp_template`** — per-clinic templates with an approval `status`
  (approved/pending/rejected, mirroring Meta's lifecycle). Seeded with a base
  catalog (`BASE_WHATSAPP_TEMPLATES`); only `approved` templates can be sent. No
  editor UI yet — the shape is ready for a future "submit for approval" flow.
- **`whatsapp_connection`** — one row per clinic: `provider`, `status`
  (connected/pending/disconnected), display `phone`, `metaAccountName`,
  `connectedAt`. The home for real provider credentials later; powers the coach
  page's status dot and the admin overview.

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
file + one `case`**, with zero caller changes. The existing outbound helpers
(`sendStudentOnboardingWhatsApp`, `sendCheckinFeedbackWhatsApp` in
`src/lib/whatsapp.ts`) route through the same port.

Because the dev provider can't confirm delivery, every outbound persists as
status **`sent`**; a real provider later upgrades it to delivered/read/failed via
status webhooks.

## Inbound: real webhook + the shared ingest path

Inbound messages (and the window re-opening) flow through **one** DAL function,
`ingestInboundMessage(ctx, { from, body })`: it finds-or-creates the conversation
by **normalized phone** (linking a student whose number matches — the student is
always derived from the phone, never passed in, exactly as production will),
appends the inbound message, sets `lastInboundAt = now` (reopening the window),
and bumps `unreadCount`.

- `POST /api/whatsapp/webhook` — the real provider webhook. Delegates to
  `provider.parseInboundWebhook`; inert until a vendor is configured (the `dev`
  provider parses nothing). Multi-tenant routing (mapping an event to a clinic via
  its `whatsapp_connection`) is wired when a provider is chosen. Public +
  unauthenticated by design; always answers 200. A `GET` handles Meta's
  `hub.challenge` verification handshake.

### Simular mensagem recebida (dev)

Since no provider is wired, use the **guarded dev endpoint** to simulate an
inbound message — it runs the *same* `ingestInboundMessage` path a real webhook
would, so one call flips a closed conversation to **open** and makes free-text
sending legal again.

`POST /api/whatsapp/dev/simulate-inbound`

- **Guard:** a plain `404` (as if the route didn't exist) unless **both**
  `NODE_ENV !== "production"` **and** `WHATSAPP_ALLOW_SIMULATE === "1"`. When
  enabled it's still coach-only + plan-gated + tenant-scoped, so it can only write
  into the caller's own clinic.
- **Body:** `{ "phone": "+55 11 99999-0000", "body": "..." }` — **no `studentId`**
  (a real webhook only gives you the sender's number; the student is resolved by
  phone).

```bash
# 1) enable it (dev only)
export WHATSAPP_ALLOW_SIMULATE=1
npm run dev

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
- **`/admin/whatsapp`** — platform-admin overview: KPIs (conectados, msgs este
  mês, janelas abertas, clínicas) + a per-tenant table (studio, número, status,
  msgs este mês, janelas abertas). Status + number come from each clinic's
  `whatsapp_connection`; the counts are computed live from the message /
  conversation tables.

## Files

- Schema: `whatsapp_conversation` / `whatsapp_message` / `whatsapp_template` /
  `whatsapp_connection`, migration `0028_whatsapp_inbox`.
- lib: `whatsapp-inbox.ts` (client-safe: enums, DTOs, 24h-window math, template
  rendering + base catalog, zod), `whatsapp-provider.ts` (the port + dev
  provider), `whatsapp.ts` (outbound helpers, now on the port).
- DAL: `whatsapp.ts` (inbox/thread reads, `sendMessage` with window+template
  enforcement, `ingestInboundMessage`, `listWaiting`, `getAdminOverview`).
- API: `coach/whatsapp` (+`[id]`), `whatsapp/webhook`,
  `whatsapp/dev/simulate-inbound`, `admin/whatsapp`; `coach/dashboard` extended.
- UI: `/coach/whatsapp` page + gated nav item, the dashboard "WhatsApp
  aguardando" widget, `/admin/whatsapp` page + admin nav item.
- Tests: `tests/whatsapp.test.ts` (window/template/schema units),
  `tests/whatsapp.integration.test.ts` (ingest, window enforcement, template
  approval, tenant isolation, read state, admin overview),
  `e2e/whatsapp.spec.ts` + `e2e/admin-whatsapp.spec.ts` (both viewports +
  screenshots).
