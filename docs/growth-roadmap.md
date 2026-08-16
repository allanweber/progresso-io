# Growth roadmap — the paywall + 10 features to convert Free → Paid and lift tiers

Grounded in the product mock (heavy **AI**, WhatsApp, portal, video, check-ins,
reminders, referral, per-aluno pricing) and expanded beyond it. Integrations
included.

> **Pricing note.** The original mock floated a **R$ 597 "Pro"** tier. The
> *shipped* ladder is **Free · Solo R$179 · Clínica R$379 · Enterprise**
> (`PLAN_PRICE_CENTS`, see `docs/monetization.md` §6). Wherever a feature gate
> below says **"Pro" it means the Clínica tier** — the top self-serve plan below
> Enterprise. A premium R$597-class tier can be reintroduced later as a Clínica
> add-on or an Enterprise floor, but it is **not** part of the current ladder.

> **Ops note — monitoring: start free, self-host later.** Two pillars, both
> **free at first with zero load on our server** (the ~$10/mo monitoring line in
> `docs/monetization.md` §5 starts at **$0**):
>
> - **Errors → [Sentry](https://sentry.io) free ("Developer"). ✅ Implemented.**
>   `@sentry/nextjs` is wired (client/server/edge init, `global-error` boundary,
>   `onRequestError`, tracing at 0.1 sample, Session Replay masked + on-error
>   only). **LGPD** is honoured: `sendDefaultPii: false`, the **EU (Frankfurt)
>   data region**, and a `beforeSend` scrub (`src/lib/sentry-scrub.ts`) that
>   strips credentials/PII. Activates when `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`
>   are set (a no-op otherwise); source-map upload runs when `SENTRY_ORG` /
>   `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` are present. Free tier ≈ 5k errors/mo,
>   1 user, 30-day retention. See `.env.example` → "Sentry".
> - **Uptime + status page → [BetterStack](https://betterstack.com)** (or
>   UptimeRobot) **free.** External watchdog (~10 monitors, 3-min checks) hosted
>   **off** our infra — so it still alerts when the box itself is down, which an
>   in-app monitor can't. *(Not yet wired — external signup only.)*
>
> **In-Brazil residency upgrade path.** Sentry SaaS has only **US / EU** regions
> (no Brazil), and we chose **EU** — LGPD-fine via DPA/adequacy. If in-country
> storage ever becomes a hard requirement, self-host **[GlitchTip](https://glitchtip.com)**
> (Sentry-SDK compatible, ~1 GB RAM) on a São Paulo box: the app code is
> **identical** — it's a **DSN swap**, no rewrite. Pair either with
> BetterStack/UptimeRobot free for uptime.
>
> **Scale-up only** when we need cross-service **distributed tracing**:
> **[SigNoz](https://signoz.io)** (OpenTelemetry, all-in-one) on a **dedicated**
> box — ClickHouse wants ~4 GB+ RAM, so **do not co-locate it with prod**.

## The two levers

- **Free → Paid wall** — things a growing coach can't live without: WhatsApp
  delivery, AI drafting caps, and the **3-aluno cap**. Anything that grows the
  roster or automates communication pushes the coach over the wall.
- **Tier-up (Solo → Clínica → Enterprise)** — "run my business" features: AI
  volume, getting paid, multi-coach, white-label, analytics.

## Gating is already solved

Every feature below is a new **`plan_limit` capability** (a boolean/quota column
+ per-clinic override + a `canUseX(ctx)` helper) on the pattern already shipped
for `whatsapp` / `archive` / `calendar`. No new plumbing — just a gate. Every
gate is enforced server-side today: student cap, coach cap, `whatsapp`,
`calendar`, `archive`, branded portal.

> **But gating ≠ collecting.** The gate opens today only when a **human flips it
> by hand** — an admin sets `clinic.plan` at `/admin/clinics/[id]` and keeps a
> manual invoice ledger (`docs/billing.md`). Every feature below feeds a
> Free→Paid wall that nobody can pay through on their own. That is **item 0**.

---

## The paywall + 10 features

| # | Feature | Lever | New capability |
|---|---------|-------|----------------|
| **0** | **Assinatura & paywall — o Progresso recebe** | **Prerequisite — enables both levers** | **— (billing core)** |
| 1 | AI Program Generator (treino + dieta por IA) | Free→Paid + Tier-up | `ai_credits` |
| 2 | WhatsApp automation engine | Free→Paid | `whatsapp` (exists) |
| 3 | Cobrança do aluno — o coach recebe pelo app | Free→Paid + Tier-up | `payments` |
| 4 | Financeiro / cockpit do negócio | Tier-up | `financials` |
| 5 | Vídeo — biblioteca + feedback em vídeo | Tier-up | `video_storage_mb` |
| 6 | Relatório de evolução (PDF branded, auto-mensal) | Tier-up | `branded_reports` |
| 7 | Integrações de saúde / wearables | Tier-up + retention | `integrations` |
| 8 | Motor de indicação (referral) | Free→Paid + viral | — |
| 9 | Loja / página de captação + funil | Tier-up + roster growth | `landing_pages` |
| 10 | App white-label do coach (PWA + push) | Tier-up / Enterprise | `white_label_app` |

### 0. Assinatura & paywall — o Progresso recebe · `PREREQUISITE`

Not an eleventh growth feature — the **precondition** for the other ten. Every
item below converts Free→Paid, but today **only a human opens that wall**.

**Already shipped, so this is automation work, not greenfield:** the plan switch
itself (`clinic.plan`, read live by every `plan_limit` gate), the `invoice` /
`invoice_line_item` schema with derived totals, the `clinic_plan_change` audit
trail, and the coach's read-only **Faturas** page. See `docs/billing.md`.

#### Phase 1 — cobrança manual · ✅ Implemented (migration `0030`)

- **Trial de 14 dias.** Advertised at `/register` (*"14 dias grátis, sem
  cartão"*) and, until this shipped, implemented nowhere — we were selling
  something that did not exist. Modelled as
  **`clinic.trial_ends_at` with the effective plan resolved on read**
  (`trial ativo → limites Solo`), **never** by flipping `clinic.plan`: one source
  of truth, the `clinic_plan_change` audit stays meaningful, and correctness
  never depends on a cron firing. Expiry is a date comparison; the cron only
  sends *"faltam 3 dias"*.
- **The trial lifts the aluno cap to 50** — the strongest conversion lever
  available and it costs nothing. A coach who imports a real roster has moved
  their business in; a coach poking at 3 fake students has not. At expiry the cap
  returns to 3 **non-destructively**: the alunos they added stay active and their
  portals keep working, they simply can't add another (the cap already blocks
  only *creation* — `src/app/api/students/route.ts`).
- **Cobrança via the existing fatura.** Admin issues the invoice, marks it paid,
  flips the plan. The coach gets an in-app banner for fatura pendente/vencida and
  an **"Assinar" CTA that contacts you directly** — there is no checkout to link
  to yet, and a bespoke request pipeline would be thrown away by Phase 2.
- **Downgrade por inadimplência stays admin-manual here, deliberately.**
  Paid/unpaid is human-entered and lossy (a Pix that landed but wasn't recorded
  yet), and auto-downgrading a paying customer over a bookkeeping lag is the
  worst failure available. **Trial expiry stays automatic** — a pure date, no
  payment ambiguity. Non-payment becomes automatic only in Phase 2, when the
  webhook makes payment state authoritative.
- **Sign-up no longer grants a paid plan.** The wizard pick is stored as
  `clinic.intended_plan` (intent only) and surfaced on `/admin/clinics/[id]` so
  the fatura bills the right plan — before this, picking "Solo" at sign-up handed
  out the paid plan for free.
- *Not here:* fatura vencimento reminders by e-mail/WhatsApp — **#2 already owns
  them**; building them twice splits the automation.

#### Phase 2 — paywall self-serve · 🔒 BLOQUEADO EM CNPJ

- Self-serve **checkout** (Free → Solo/Clínica, **mensal + anual** — R$1.790 /
  R$3.790 are priced and unsellable today), **Asaas** recurring (Pix / boleto /
  cartão), **webhook → plan flip automático**, faturas geradas automaticamente,
  **upgrade / cancel / downgrade self-serve**. Enterprise stays *admin-assisted*
  (valor negociado, then auto-charges); the admin override stays for comps and
  support.
- **Dunning ladder**, automatic once the webhook is authoritative — and
  non-destructive at every step: retry ~3×/7 dias → **grace +7 dias** (plano
  ativo, banner + e-mail + WhatsApp) → **dia ~14 downgrade para Free**
  (automações off, sem novos alunos, **todos os alunos existentes continuam
  funcionando**) → **restauração instantânea ao pagar**. The pressure lands on
  the coach's growth, never on alunos mid-program.

#### Why Phase 2 is blocked

Asaas accepts **CPF** accounts — you can receive Pix/boleto/cartão as pessoa
física, so nothing blocks *taking money*. Two things need the **CNPJ**:

1. **Subcontas are CNPJ-only** (BACEN Res. Conjuntas 16/17, BaaS) — a CPF account
   cannot create them at all, and **#3 is built on them**.
2. **The margin model assumes a company.** `docs/monetization.md` §4(c) plans for
   **~10% Simples Nacional**; as pessoa física it's IRPF progressivo **até 27,5%
   + INSS**, which roughly halves the modelled margin. Nota fiscal for coaches
   needs it too.

**Migrating CPF → CNPJ later is supported but not free:** charges do **not** move
between accounts (a separate import), and **stored card credentials are not
portable** — every recurring-cartão customer must re-authorize. The cost scales
with how many active subscriptions exist at migration time, so **migrate while
the base is small**. *(Confirm the subconta rule with Asaas before designing #3.)*

---

### 1. AI Program Generator — treino + dieta por IA · `FREE→PAID + TIER-UP`
Coach picks goal + anamnese → AI drafts a full **workout and diet** from the
clinic's own catalog (TACO foods + exercise library already exist). Free = 3
gerações/mês (taste it); Solo = more; Clínica = unlimited **+ AI-drafted
check-in feedback** and "reescrever em tom X". The mock's flagship (197 "IA"
mentions).
*Integration: Anthropic Claude API.*

### 2. WhatsApp automation engine · `FREE→PAID (the #1 reason to upgrade)`
The gate exists; build the payload: auto check-in reminders, overdue nudges,
**fatura vencimento** reminders (ties to the fatura PDF already shipped),
renovação/aniversário, and a coach↔aluno inbox. Free = e-mail only; Solo+ =
WhatsApp.
*Integration: WhatsApp Business Cloud API (Meta) or a BSP — 360dialog / Zenvia /
Take Blip.*

### 3. Cobrança do aluno — o coach recebe pelo app · `FREE→PAID + TIER-UP`
Today faturas are the *clinic's* Progresso bill. Flip it: let coaches **charge
their own students** — recurring + one-off, via **Pix / boleto / cartão**. Makes
the coach money inside the product = maximum stickiness. Free = manual "copia e
cola Pix"; Solo+ = automated recurring + payment links; Clínica = split, contratos,
retry de inadimplência. **Requires a CNPJ, and is separate work from item 0**:
that one is "we charge our customers" (we are merchant of record, one account);
this is a **marketplace** — an Asaas **subconta per coach with KYC** plus split
payments, handling third-party money. Same vendor, very little shared code.
*Integration: **Asaas** — the chosen BR gateway: recurring Pix/boleto/cartão,
**no monthly fee** (pay-per-transaction), split payments, webhooks, and NFS-e
hooks that feed #4. Alternativas avaliadas: Pagar.me / Mercado Pago / Stripe BR.*

### 4. Financeiro / cockpit do negócio · `TIER-UP (Clínica)`
MRR, receita, inadimplência, LTV, churn, previsão — the "R$ 21,4k" screen from
the mock. Feeds off #3. Free/Solo = receita simples; Clínica = dashboard
completo + rateio entre coaches + **emissão de nota fiscal**.
*Integration: NFS-e (NFe.io / Focus NFe), export contábil.*

### 5. Vídeo — biblioteca + feedback em vídeo · `TIER-UP (storage tiers)`
Attach demo videos to exercises/workouts and let the coach record **personalized
video feedback** on each check-in (the mock's "video" theme). Free = só link
YouTube; Solo+ = upload hospedado (quota); Clínica = feedback em vídeo + quota maior.
*Integration: Cloudflare R2/Stream or Mux.*

### 6. Relatório de evolução do aluno (PDF branded, auto-mensal) · `TIER-UP`
Reuse the pdfkit renderer already in the repo: a branded before/after report —
peso, fotos, medidas, adesão — auto-generated monthly and **sent by WhatsApp**
(ties #2). Free = nada; Solo = básico; Clínica = branded + automático.
*Integration: pdfkit (installed) + WhatsApp.*

### 7. Integrações de saúde / wearables · `TIER-UP + retention`
Auto-import weight (smart scale), passos, sono, FC — enriches check-ins with zero
aluno effort and powers "peso destoando da meta" alerts. Free = manual; Solo+ = 1
integração; Clínica = todas + alertas automáticos.
*Integration: Google Fit / Health Connect, Apple HealthKit, Strava, Renpho/Xiaomi
scales.*

### 8. Motor de indicação (aluno-traz-aluno + coach-traz-coach) · `FREE→PAID + viral`
Two loops: alunos indicam amigos (desconto) and coach indica coach (mês grátis
pros dois). The clever part: aluno referrals **grow the roster past the 3-aluno
free cap** → forces the Solo upgrade, while acquiring users for free.
*Integration: links únicos + tracking; cupom opcional no #3.*

### 9. Loja / página de captação + funil · `TIER-UP + roster growth`
A public sales page per coach (planos, depoimentos, captação de leads) that turns
visitors into alunos, with lead inbox → WhatsApp handoff → checkout via #3.
Extends the branded microsite already shipped. Free = perfil simples; Solo =
formulário de leads; Clínica = funil completo (múltiplos planos, A/B).
*Integration: #2, #3, GA (já existe).*

### 10. App white-label do coach (PWA instalável + push) · `TIER-UP / Enterprise`
The branded portal (shipped) → an **installable app** with the coach's logo/ícone
na home do aluno e **push notifications**. Clínica = subdomínio branded (feito);
Clínica/Enterprise = PWA instalável + push; Enterprise = app nas lojas + SSO + API.
*Integration: web-push (VAPID); wrapper opcional (Capacitor/Median) para as lojas.*

---

## Suggested sequencing (fastest revenue impact)

1. **#0 Paywall — Phase 1 first.** The trial is advertised and missing, and every
   feature below feeds a wall only a human can open. Phase 2 waits on the CNPJ.
2. **#2 WhatsApp** + **#3 Cobrança** — the two that most directly convert
   Free→Solo and make the product sticky (the coach gets paid inside the app).
   **#3 also needs the CNPJ** (subcontas), so it unblocks together with 0's Phase 2.
3. **#1 AI generator** — the headline tier-up and where the mock is clearly
   heading.
4. **#6 Relatório PDF** — nearly free to build (the pdfkit engine already exists).
