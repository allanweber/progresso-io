# Growth roadmap — 10 features to convert Free → Paid and lift tiers

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
for `whatsapp` / `archive` / `calendar`. No new plumbing — just a gate.

---

## The 10 features

| # | Feature | Lever | New capability |
|---|---------|-------|----------------|
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
retry de inadimplência. This is also the **paywall gateway** — the same provider
collects the clinic's own Progresso subscription (see `docs/monetization.md` §4).
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

1. **#2 WhatsApp** + **#3 Cobrança** — the two that most directly convert
   Free→Solo and make the product sticky (the coach gets paid inside the app).
2. **#1 AI generator** — the headline tier-up and where the mock is clearly
   heading.
3. **#6 Relatório PDF** — nearly free to build (the pdfkit engine already exists).
