# Manual billing (plan + invoices)

There is **no payment gateway** yet. A platform admin manages each clinic's
**plan** and **invoices** by hand, from the per-clinic admin detail page at
`/admin/clinics/[id]`. The coach sees its own invoices read-only.

## The two things are independent

- **Plan** is the *functional switch*. Setting `clinic.plan` instantly grants or
  revokes the clinic's features — the student cap (via `plan_limit`) and the
  branded portal (`canUseBrandedPortal`) — because those read `clinic.plan`
  live. Every plan change is logged to `clinic_plan_change` (from → to, which
  admin, when, optional note).
- **Invoices** are a *manual ledger*. Creating or marking an invoice paid does
  **not** touch the plan, and changing the plan does **not** create an invoice.
  Marking an invoice paid is a bookkeeping action only.

This independence is deliberate: the admin flips the plan to give access, and
tracks money separately. When real billing lands later, it can wire the two
together; nothing here assumes they are linked.

## What's next — roadmap item 0

Automating this is **item 0** in `docs/growth-roadmap.md` ("Assinatura & paywall
— o Progresso recebe"), split so the gateway half doesn't block the rest:

- **Phase 1 — cobrança manual (buildable now).** The **14-day trial** plus an
  in-app fatura pendente/vencida banner and an "Assinar" CTA that contacts the
  admin. The flow on this page stays exactly as documented: admin issues the
  fatura, marks it paid, flips the plan. Downgrade for non-payment stays
  **admin-manual** on purpose — paid/unpaid is human-entered here, and
  auto-downgrading a paying customer over a bookkeeping lag is the worst
  available failure.
- **Phase 2 — self-serve paywall (blocked on CNPJ).** Asaas checkout, webhooks
  driving the plan flip automatically, auto-generated invoices, and an automatic
  dunning ladder. Blocked because Asaas **subcontas are CNPJ-only** and the
  margin model in `docs/monetization.md` §4(c) assumes Simples Nacional.

## The 14-day trial (item 0 Phase 1 — shipped)

Every clinic created at sign-up starts on **`free` with `clinic.trial_ends_at`
set 14 days out**, matching what `/register` advertises ("14 dias grátis, sem
cartão"). While that date is in the future **and the plan is still `free`**, the
clinic resolves to **Solo** limits — 50 alunos, WhatsApp, Agenda, microsite.

The trial is **not a plan value**, deliberately:

- `clinic.plan` is never rewritten, so **`clinic_plan_change` keeps auditing only
  real plan changes** and the stored plan always reflects what is actually paid for.
- Expiry is a **date comparison inside `getPlanLimits`** — correct even if no job
  ever runs. A cron is only ever needed for a "faltam N dias" nudge, never for
  correctness.
- Expiry is **non-destructive**. The cap drops back to 3, but the student cap is
  only checked when *creating* a student, so alunos added during the trial stay
  active and their portals keep working — the clinic simply can't add more.

A per-clinic override still beats the trial: an admin who capped a clinic meant it.

**Sign-up never grants a paid plan.** The plan picked in the wizard is stored as
`clinic.intended_plan` — *intent only* — and shown on the clinic's admin page so
the manual fatura bills the right thing. (Before this, picking "Solo" at sign-up
handed out the paid plan for free.)

## Managing a subscription (admin)

Everything is on the clinic's detail page, `/admin/clinics/[id]`:

| To… | Do |
| --- | --- |
| See what they asked for | The **Plano** card shows *"Plano escolhido no cadastro"* (intent) and the trial's state (active until / ended on) |
| Give access | Set the plan — it takes effect instantly |
| Bill | Create an invoice, then mark it paid when the money lands |
| Bend the rules for one clinic | The per-clinic limit overrides |

The coach sees a banner in-app while a trial is running or a fatura is open, with
an **"Assinar"** button pointing at `/contact` — there is no checkout until item 0
Phase 2, so the CTA reaches a human.

> **Downgrade for non-payment is deliberately manual.** Paid/unpaid is
> human-entered here and therefore lossy (a Pix that landed but wasn't recorded),
> and auto-downgrading a paying customer over a bookkeeping lag is the worst
> failure available. It becomes automatic in Phase 2, when the gateway webhook
> makes payment state authoritative.

## Data (migration `0023`)

- **`invoice`** — one row per invoice: a platform-wide sequential `number`,
  `status` (`pending` / `paid` / `canceled`), `competencia` / `issued_at` /
  `due_date` / `paid_at` (dates), `payment_method`, `discount_cents` +
  `discount_reason`, a `plan_snapshot` (the plan the invoice was billed for),
  `notes`, and `created_by`. The **total is never stored** — it is always
  derived as `sum(line items) − discount`, floored at 0.
- **`invoice_line_item`** — the invoice's lines (`description`, `amount_cents`,
  `position`), cascade-deleted with the invoice.
- **`clinic_plan_change`** — the plan audit trail (`from_plan`, `to_plan`,
  `changed_by`, `note`, `created_at`).

Money is BRL **cents** (integers) everywhere. An invoice is **overdue** when it
is still `pending` and its `due_date` is before today — a derived flag, not a
stored status.

## Code

- **`src/lib/billing.ts`** — client-safe domain: enum values + PT-BR labels,
  money/date helpers (`formatBRL`, `formatCompetencia`, `reaisToCents`…), the
  derived-total + overdue rules, the DTOs the screens read, and the zod schemas
  the API validates (`invoiceWriteSchema`, `markPaidSchema`, `planChangeSchema`).
- **`src/server/dal/billing.ts`** — the DAL. Admin functions take a raw `DB` and
  are **not** tenant-scoped (gated by `getAdminSession()` at the route):
  `setClinicPlan` (transactional, row-locked, logs the change), `listPlanChanges`,
  and the invoice CRUD (`createInvoice` assigns the next `number` in a
  transaction; `updateInvoice` replaces the line items; `markInvoicePaid`,
  `cancelInvoice`, `deleteInvoice`). The coach's own read, `listMyInvoices`,
  takes a `TenantContext` and is scoped to `ctx.clinicId`.
- **API** — admin (all `getAdminSession` + zod): `GET /api/admin/clinics/[id]`
  (clinic + plan history + invoices), `PUT /api/admin/clinics/[id]/plan`,
  `GET|POST /api/admin/clinics/[id]/invoices`, `PUT|DELETE /api/admin/invoices/[id]`,
  `POST /api/admin/invoices/[id]/pay`, `POST /api/admin/invoices/[id]/cancel`.
  Coach: `GET /api/coach/invoices` (own clinic only, read-only).
- **UI** — `/admin/clinics/[id]` (reached from Manutenção → Clínicas): the plan
  control + change history, and the invoice table with a create/edit dialog
  (line items + discount, live total), a mark-paid dialog, and cancel/delete.
  The coach sees a read-only **Faturas** card in `/coach/settings`.

## Printing an invoice (PDF)

There is no server-side PDF renderer. Each invoice has a **print-friendly view**
at `/admin/invoices/[id]/print` (a Printer action on each table row opens it in a
new tab) — an "Imprimir / PDF" button calls `window.print()`, and the browser's
print dialog saves it as a PDF. The dashboard chrome (sidebar + header) is hidden
under `@media print` via `print:` classes on `DashboardShell`, so the printed
page is just the invoice document: a "Progresso" issuer header, the clinic as
payee, the dates/plan/status meta, the line items, and the derived totals. The
data comes from `GET /api/admin/invoices/[id]` (invoice + clinic), admin-gated.

## Rules honored

- Every API route validates its input with **zod** and derives identity from the
  session — the admin routes gate on `getAdminSession()`; the coach route gates
  on the coach role and scopes strictly by `ctx.clinicId`.
- All DB access goes through the **DAL**; pages are client components talking to
  API routes via TanStack Query; forms use TanStack Form.
