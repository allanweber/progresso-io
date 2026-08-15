# Monetization & unit economics

A business-planning document for the **unit economics of a customer** on
Progresso: what it costs to serve one, what a plan charges, and the resulting
**gross margin**. It models every usage-driven cost the platform incurs on a
clinic's behalf — **WhatsApp template messaging** (Meta), **photo storage**
(Cloudflare R2), **relational data** (PostgreSQL), and **payment processing** —
then sets them against **plan pricing** (§5) for the two reference customers:

- **Solo** — a one-coach clinic at its student cap of **50 students**.
- **Clínica** — a multi-coach clinic with **3 coaches** at its cap of **100
  students**.

The clinic is the tenant (`clinicId`); every cost here scales with **students
and their activity**, not with the number of coaches. Weekly feedback cadence
(`feedbackFrequency = "semanal"`) is assumed throughout, since that is the
heaviest realistic cadence and the one the product is built around.

> All external rates (Meta per-message, R2 per-GB, BRL/USD FX) are **approximate
> and change over time** — see [Assumptions & sources](#assumptions--sources).
> Update that section and the totals follow.

---

## 1. WhatsApp template messaging

### 1.1 What actually sends a message

The message catalog is 8 base templates (`drizzle/data/whatsapp-templates.json`),
sent by the automations in `src/server/whatsapp-automations.ts`. Only some are
recurring monthly drivers:

| Template `key` | Fires when | Cadence | Monthly driver? |
| --- | --- | --- | --- |
| `checkin_reminder` | Scheduled cron on the clinic's preferred weekday, **only** for students who are *due/overdue*; coalesced to **at most once per cadence period** | Weekly | ✅ recurring |
| `checkin_feedback` | Coach answers a check-in | Per check-in → weekly | ✅ recurring |
| `diet_published` | Coach publishes a diet version | Event (~1×/mo assumed) | ✅ recurring |
| `workout_published` | Coach publishes a workout version | Event (~1×/mo assumed) | ✅ recurring |
| `welcome_access` | Portal invite at onboarding | Once per student | ⏺ one-time |
| `anamnesis_welcome` | Registration | Once per student | ⏺ one-time |
| `anamnesis_reminder` | Composer only (manual) | Ad hoc | ➖ manual |
| `session_confirm` | Composer only (manual) | Ad hoc | ➖ manual |

Two structural facts from the code shape the volume:

1. **Reminder and feedback are near-mutually-exclusive per week.**
   `computeCheckinDue` only flags a student due/overdue. A punctual student who
   checks in on time is *not* due on the preferred day → gets **no reminder**,
   only the `checkin_feedback` reply. A slipping student gets the **reminder**,
   then checks in, then the feedback. So the weekly loop is **1 msg/student/week
   (punctual) → 2 (needs nudging)**.
2. **Coaches do not multiply volume.** Sends are per-student; 3 coaches split the
   same workload. The Clínica costs ~2× the Solo purely because it has 2× the
   students.

Basis: **weeks/month = 52 ÷ 12 = 4.33**. Diet/workout publishing assumed **~1×/mo
per student** (coach behavior, adjustable).

### 1.2 Monthly message volume

| Template | Per student/mo | **Solo (50)** | **Clínica (100)** |
| --- | --- | --- | --- |
| `checkin_feedback` (weekly) | 4.33 | 217 | 433 |
| `checkin_reminder` (weekly, only if due) | 0 – 4.33 | 0 – 217 | 0 – 433 |
| `diet_published` (~1/mo) | 1 | 50 | 100 |
| `workout_published` (~1/mo) | 1 | 50 | 100 |
| **Recurring total** | | **317 – 533** | **633 – 1,067** |

- **Lean** = punctual roster (feedback + publishing), no reminders needed.
- **Full** = every student also nudged every week.
- **One-time onboarding** (filling the roster once): `welcome_access` +
  `anamnesis_welcome` = 2 × students → Solo **+100**, Clínica **+200** messages.

### 1.3 Meta billing model (Brazil, post-July 2025)

Meta bills **per delivered template**, by category; free-form replies inside an
open 24h window are free. **All 8 of our templates are Utility** (account/service
updates — none are marketing).

| Category | Brazil rate (USD/msg) | Our usage |
| --- | --- | --- |
| **Utility** | **~$0.0080** | ✅ all templates |
| Marketing | ~$0.0625 | only if a nudge is reclassified as promotional |
| Authentication | ~$0.0315 | none (no OTP) |
| Service (in-window, free-form) | **Free** | coach's free-text inbox replies |

A further discount exists — **utility templates delivered inside an open 24h
window are free** — but most of our sends are *proactive* (scheduled reminder,
publish pings, onboarding) with no open window, so we price them all as **paid
utility**: the conservative upper bound. In-window sends only make it cheaper.

### 1.4 Cost — base case (all Utility, $0.0080/msg)

| Customer | Scenario | Msgs/mo | **USD/mo** | ≈ BRL/mo | ≈ USD/yr |
| --- | --- | --- | --- | --- | --- |
| **Solo (50)** | Lean | 317 | **$2.54** | R$14 | $30 |
| **Solo (50)** | Full | 533 | **$4.26** | R$23 | $51 |
| **Clínica (100)** | Lean | 633 | **$5.06** | R$28 | $61 |
| **Clínica (100)** | Full | 1,067 | **$8.54** | R$47 | $102 |

One-time onboarding ramp: Solo ~**$0.80**, Clínica ~**$1.60** (negligible).

### 1.5 Sensitivity — if nudges are classified Marketing ($0.0625/msg)

| Customer | Scenario | **USD/mo** | ≈ BRL/mo |
| --- | --- | --- | --- |
| Solo (50) | Full | **$33.31** | R$183 |
| Clínica (100) | Full | **$66.69** | R$367 |

Controllable: keep template bodies transactional (they already read as utility)
and submit them under the **Utility** category to stay in the $0.008 lane.

### 1.6 Messaging caveats

- **Direct vs. BSP.** These are Meta Cloud API pass-through rates. The provider
  is still undecided (`whatsapp-provider.ts` — Meta Cloud / Twilio / Z-API). A
  BSP (Twilio, Zenvia, 360dialog) adds a **per-message markup** (~$0.005–$0.015)
  that can *double* the effective cost. Going direct on Meta Cloud is materially
  cheaper at this volume.
- **Inbound is free.** Student replies and free-text within the window are the
  free Service category — not counted above.
- **Rates/free-tiers move.** Verify against Meta's current Brazil rate card.

---

## 2. Photo storage (Cloudflare R2)

### 2.1 What consumes storage

| Source | Per-tenant? | Size | Growth |
| --- | --- | --- | --- |
| **Check-in photos** (`putCheckinPhoto`) | ✅ yes | 4 poses/check-in, compressed | **Dominant, cumulative** |
| Clinic logo (`putClinicLogo`) | ✅ yes | 1 per clinic, ≤5 MB cap (~200 KB real) | One-off, negligible |
| Exercise images (`putExerciseImage`) | ❌ shared base catalog | — | Not per-customer |
| Food catalog | ❌ | no images | — |

So the storage budget **is** the check-in photos. Each is compressed
**client-side before upload** (`src/lib/image-compression.ts`): longest edge
downscaled to **1600px**, re-encoded **WebP q0.72**. A server backstop caps each
at **3 MB** (`CHECKIN_PHOTO_MAX_BYTES`), but a real 1600px physique photo lands
around **~250 KB** — that's the base assumption; a "heavy" roster of larger
photos is modeled at 500 KB.

### 2.2 Growth model

- Photos per check-in: **4** (frente, costas, lado esq., lado dir.)
- Weekly cadence → **4.33 check-ins/mo** → **17.3 photos/student/mo**
- Per student: **~4.3 MB/mo**, **~52 MB/yr** (base 250 KB); double at 500 KB.

| | Added/mo | Added/yr | Photo size |
| --- | --- | --- | --- |
| **Solo (50)** | **~217 MB** | **~2.5 GB** | base (250 KB) |
| **Solo (50)** | ~433 MB | ~5.1 GB | heavy (500 KB) |
| **Clínica (100)** | **~433 MB** | **~5.1 GB** | base (250 KB) |
| **Clínica (100)** | ~867 MB | ~10.2 GB | heavy (500 KB) |

Storage is **cumulative** — photos are retained for the life of the check-in
(cascade-deleted only if the check-in is). There is **no retention/pruning
policy today**, so the store grows indefinitely.

### 2.3 Cumulative store (base case, 250 KB)

| End of… | Solo | Clínica |
| --- | --- | --- |
| Year 1 | 2.5 GB | 5.1 GB |
| Year 2 | 5.1 GB | 10.2 GB |
| Year 3 | 7.6 GB | 15.2 GB |

### 2.4 R2 cost

R2 pricing: **storage $0.015/GB-mo**, **Class A (writes) $4.50/M**, **Class B
(reads) $0.36/M**, **egress $0 (free)**; monthly free tier 10 GB-mo storage,
1M Class A, 10M Class B (per *account*, i.e. platform-wide).

**Storage** (monthly run-rate on the accumulated store):

| End of… | Solo GB → USD/mo | Clínica GB → USD/mo |
| --- | --- | --- |
| Year 1 | 2.5 GB → **$0.038** | 5.1 GB → **$0.076** |
| Year 3 | 7.6 GB → **$0.114** | 15.2 GB → **$0.229** |

**Writes** (Class A): Solo ~866/mo → **$0.004/mo**; Clínica ~1,732/mo →
**$0.008/mo**. **Reads** (Class B, students viewing own photos): negligible.
**Egress: $0** — R2's zero-egress model is the reason serving these photos is
essentially free (on S3, egress would dominate).

**Effective storage cost: cents/customer/month, well inside R2's free tier at
the platform level for years.**

### 2.5 Storage levers

- **Retention policy** (e.g. keep the last 12 months of photos) would *cap*
  cumulative growth at ~52 MB/student (base) instead of growing forever — the
  single biggest lever if the store ever matters.
- Compression is already applied; lowering `maxEdge`/`quality` trades photo
  fidelity for size but the current 250 KB is already cheap.

---

## 3. Relational data (PostgreSQL)

Distinct from R2: Postgres holds **metadata and text**, never the image bytes
(those are R2; the DB only stores the `r2_key` string). So per-student the
relational footprint is small — but it is priced completely differently: managed
Postgres bills by **provisioned instance + allocated storage**, not per-GB usage.

### 3.1 What grows per student (recurring rows)

Derived rows (calendar check-in markers, invoice markers, live diet/workout
nutrition) are **computed on read and never stored**, so they cost nothing. The
tables that actually accumulate per student:

| Table | Rows/student/mo | ~KB/row* | KB/student/mo |
| --- | --- | --- | --- |
| `student_checkin` | 4.33 | 0.6 | 2.6 |
| `student_checkin_photo` (metadata only) | 17.3 | 0.35 | 6.1 |
| `checkin_assessment` (when coach measures) | ~2 | 0.6 | 1.2 |
| `whatsapp_message` (sends + inbound) | ~16 | 0.35 | 5.6 |
| `notification` (+ read) | ~9 | 0.35 | 3.2 |
| `student_diet_version` (jsonb structure) | 1 | 3.5 | 3.5 |
| `student_workout_version` (jsonb structure) | 1 | 4.0 | 4.0 |
| **Total** | | | **~26 KB** |

*Including Postgres tuple overhead (~23 B header), alignment, and per-table
indexes. Add ~20% for bloat/vacuum slack → **~30 KB/student/month on disk**.*

One-time per student (row created once, not recurring): `students`,
`student_diet` / `student_workout`, `student_anamnesis` (jsonb), the
`whatsapp_conversation`, and Better Auth `user`/`account`/`session` ≈ **~5 KB**.

### 3.2 Per-customer footprint

At **~30 KB/student/month**:

| | Per month | Per year | Cumulative Y3 |
| --- | --- | --- | --- |
| **Solo (50)** | ~1.5 MB | ~18 MB | **~54 MB** |
| **Clínica (100)** | ~3.0 MB | ~36 MB | **~108 MB** |

**Shared base catalog is separate and fixed** (one copy per database, *not* per
tenant): the TACO food + nutrient tables, exercise catalog, base substitutions,
starter diet/workout templates, anamnesis + WhatsApp base templates — on the
order of **tens of MB total**, amortized across every clinic. It does not scale
with customer count.

### 3.3 Cost on a paid provider

The important mental model: **managed Postgres is a fixed-instance cost, not
per-GB like R2.** A Solo clinic's ~54 MB (3 yr) or a Clínica's ~108 MB is a
rounding error against any instance's included storage — the whole platform
(base catalog + hundreds of clinics) fits in an entry tier for years. So the
**marginal storage cost per customer is effectively $0**; what you actually buy
is one instance sized for *compute*, shared across all tenants.

Representative entry tiers (fixed monthly, platform-wide — *approximate*):

| Provider | Entry tier | Included storage | ≈ USD/mo |
| --- | --- | --- | --- |
| Supabase | Pro | 8 GB | ~$25 |
| Neon | Launch | ~10 GB | ~$19 |
| DigitalOcean Managed PG | 1 GB/1 vCPU | 10 GB | ~$15 |
| AWS RDS `db.t4g.micro` + 20 GB gp3 | — | 20 GB | ~$15 |

If you *do* want a pure per-GB figure (e.g. storage overage on Supabase
$0.125/GB-mo or Neon $0.35/GB-mo), the Y3 footprint costs:

| | Supabase overage | Neon rate |
| --- | --- | --- |
| Solo (54 MB) | ~$0.007/mo | ~$0.019/mo |
| Clínica (108 MB) | ~$0.014/mo | ~$0.038/mo |

i.e. **sub-cent to a few cents per customer per month** even priced as pure
usage. In practice it's absorbed by the fixed instance: at, say, a $25/mo
instance shared across 50 clinics, that's **~$0.50/clinic/mo of fixed DB cost**,
falling as clinics are added.

---

## 4. Variable cost per customer (infra + payment + tax)

Three cost layers scale with each paying customer. In BRL at R$5.50/USD.

**(a) Infra usage** — WhatsApp + R2 photos + Postgres marginal (§1–3):

| Line | Solo | Clínica | Ref |
| --- | --- | --- | --- |
| WhatsApp (Utility, lean → full) | R$14 – R$23 | R$28 – R$47 | §1.4 |
| R2 photos | ~R$0.22 | ~R$0.44 | §2.4 |
| Postgres (marginal) | ~R$0.06 | ~R$0.11 | §3.3 |
| **Infra subtotal** | **~R$14 – R$24** | **~R$28 – R$48** | |

**(b) Payment processing** — the gateway fee to collect the subscription, via a
low-cost Brazilian recurring-billing gateway (e.g. **Asaas**; Vindi/Iugu/Stripe
BR are pricier). Method-dependent, and in Brazil this *outweighs* the infra cost:

| Method | Rate | On R$179 (Solo) | On R$379 (Clínica) |
| --- | --- | --- | --- |
| **Pix** | ~1% (or R$1.99 flat) | ~R$2 | ~R$4 |
| Boleto | ~R$1.99 – 3.49 flat | ~R$2 – 3 | ~R$2 – 3 |
| **Cartão recorrente** | ~4.5% + R$0.49 | ~R$8 | ~R$17 |

**(c) Taxes on revenue** — a Brazilian SaaS under **Simples Nacional** pays from
~6% (Anexo III, if fator-R ≥ 28%) up to ~15.5% (Anexo V, tech/low-payroll) of
revenue; an ISS-only regime is ~2–5%. Planning midpoint **~10% of price**
(*confirm with an accountant for your regime — this is the single biggest cost
after payment*):

| | On R$179 (Solo) | On R$379 (Clínica) |
| --- | --- | --- |
| Tax @ ~10% | ~R$18 | ~R$38 |

Tax is a deduction from revenue, not strictly COGS — shown so the operating
margin in §6 is honest.

## 5. Fixed infrastructure cost stack

One shared stack serves every tenant, sized for **production reliability**
(managed, backed-up, São-Paulo region where latency matters for Brazilian
users) — not the absolute cheapest option. Monthly, at R$5.50/USD:

| Item | Example provider | Why / reliability | USD/mo | BRL/mo |
| --- | --- | --- | --- | --- |
| App hosting | Vercel Pro (GRU edge) | ~99.99%, SP edge = low BR latency, zero-ops deploy | $25 | R$138 |
| Managed Postgres | Supabase Pro / Neon | daily backups + PITR, HA, `sa-east-1` | $25 | R$138 |
| Object storage | Cloudflare R2 | 99.9%, **zero egress** | $5 | R$28 |
| Transactional email | Resend Pro (50k/mo) | invites + portal/check-in notifications | $20 | R$110 |
| Domain | Registro.br `.com.br` + `.com` | — | ~$1.5 | R$8 |
| Monitoring + uptime | Sentry + BetterStack | error tracking + downtime alerts | $10 | R$55 |
| **Total fixed** | | | **~$86** | **~R$477** |

The recurring-billing gateway (Asaas) adds **no monthly fee** — it's pay-per-
transaction, already in §4(b). Vindi/Iugu alternatives carry a ~R$100–300/mo
floor. Budget a band of **~R$450–650/mo** as monitoring/tiers grow; the next
step-cost is a **larger Postgres compute tier** once total students climb (a
tier bump, ~+$25–50/mo, not a per-customer cost).

Amortized across **N paying clinics**: ~R$477 ÷ N per clinic. Break-even on the
fixed stack ≈ **3 Solo clinics** (R$537 > R$477).

## 6. Pricing recommendation (Brazilian market)

### 6.1 The floor, the band, the ceiling

- **Cost floor** (what a plan must clear at scale, fixed → 0): Solo
  **~R$46/mo** (infra R$24 + cartão R$8 + tax R$18); Clínica **~R$103/mo**. Any
  price above these is structurally profitable.
- **Market band** (approximate BR comparables): single-professional diet
  software (Dietbox, WebDiet, Nutrium) **R$40–130/mo**; global coaching
  platforms (Trainerize, Everfit, PT Distinction) **~R$275–550/mo per ~100
  clients**; full gym-management (Tecnofit, Pacto, W12) **R$200–1000+**. This
  product bundles diet + workout + WhatsApp automations + anamnese + photo
  check-ins + branded microsite — richer than a diet app, lighter than gym
  management. Fair band: **Solo R$100–250, Clínica R$300–550**.
- **Value ceiling**: a coach with 50 alunos at ~R$150 each bills ~R$7.500/mo, so
  R$179 software = **~2.4% of their revenue** — high willingness to pay.
- **Per-aluno benchmark**: at cap, R$179/50 = **R$3.6/aluno** and R$379/100 =
  **R$3.8/aluno**, in line with Trainerize's ~R$3.3/client.

### 6.2 Recommended plans

> The code's `PLAN_PRICE_CENTS` (Solo R$199 / Clínica R$399) are **placeholders**.
> Cost- and market-justified recommendation:

| Plan | Monthly | Annual (~2 mo free) | Includes |
| --- | --- | --- | --- |
| **Free** | R$0 | — | 1 coach, 3 alunos, 14-day trial of paid features — acquisition hook |
| **Solo** | **R$179** | **R$1.790** (~R$149/mo) | 1 coach, 50 alunos, WhatsApp + Calendar + branded microsite |
| **Clínica** | **R$379** | **R$3.790** (~R$316/mo) | up to 3 coaches, 100 alunos, all features |
| **Enterprise** | sob consulta | — | 3+ coaches / 100+ alunos, priority support, custom |

(R$197 / R$397 are viable premium anchors — a few points more margin at some
adoption cost. Validate the exact point with a real price test.)

### 6.3 Margin at the recommended prices

Full-load worst case (every student nudged + publishing), **cartão** payment,
~10% tax:

| Plan | Price | Contribution* | After tax + fixed @ 50 clinics | At scale (→ ∞) |
| --- | --- | --- | --- | --- |
| **Solo** | R$179 | ~82% | **~67%** | ~71% |
| **Clínica** | R$379 | ~83% | **~70%** | ~73% |

*Contribution = (price − infra − payment) ÷ price, before tax & fixed.*

Steering to **Pix + lean messaging** lifts contribution to ~90% and operating
margin into the **mid-70s%**. The margin is essentially **flat across plans**
(Clínica costs ~2× and prices ~2×) — a clean, scalable structure.

**Bottom line:** at realistic BR-market prices and *fully* costed (infra +
payment + tax + fixed), unit economics are **software-grade — ~70% operating
margin at modest scale (~50 clinics), climbing toward the low-80s% as you grow**.
Margin levers, in order of impact: (1) **payment method** (Pix vs. cartão), (2)
**tax regime** (Anexo III vs. V — worth an accountant), (3) **customer count** vs.
the fixed stack (dominant below ~10 clinics). Infra usage (storage, DB, message
volume) is **not** a meaningful lever.

---

## Assumptions & sources

Every number below is a **lever** — change it here and the section it feeds
updates. Ranges show the sensitivity band; the **base** value is what the tables
use.

| Input | Base value | Range / sensitivity | Source / note |
| --- | --- | --- | --- |
| Feedback cadence | Weekly (`semanal`) | weekly → mensal (÷4 volume) | Heaviest cadence; product default. Biweekly ≈ halves messaging |
| Weeks per month | 4.33 | fixed | 52 ÷ 12 |
| Solo cap | 50 students | — | Plan limit |
| Clínica cap | 100 students, 3 coaches | — | Plan limit (coaches don't add volume) |
| Diet/workout publish | ~1×/mo each | 0.5 – 1.5×/mo | Coach behavior; ±R$3–8/mo swing (Solo). Low driver |
| Meta Utility (BR) | $0.0080/msg | $0.006 – $0.010 | Meta revises; **the** messaging driver |
| Meta Marketing (BR) | $0.0625/msg | — | Sensitivity only — avoid by keeping templates Utility |
| BRL/USD | R$5.50 | R$5.0 – R$6.0 | FX-dependent; scales all USD lines ±10% |
| Compressed photo | 250 KB | 150 – 500 KB | 1600px WebP q0.72; 3 MB server cap. Storage only (cheap either way) |
| Photos per check-in | 4 | fixed | `student_checkin_photo` poses |
| R2 storage | $0.015/GB-mo | egress free | Cloudflare list price |
| Postgres row footprint | 30 KB/student/mo | 25 – 40 KB | Row width + indexes + ~20% bloat |
| Managed Postgres | fixed ~$25/mo instance | +$0.125–0.35/GB-mo overage | Supabase Pro / Neon; marginal ≈ $0 |
| App hosting | $25/mo | $20 – 50 | Vercel Pro (GRU edge) or Fly.io |
| Email (Resend) | $20/mo (Pro, 50k) | free (3k) – $20 | Transactional invites + notifications |
| Domain | ~$1.5/mo | — | `.com.br` (Registro.br) + `.com` |
| Monitoring + uptime | $10/mo | $0 – 26 | Sentry + BetterStack; free tier early |
| **Fixed infra stack (total)** | **~R$477/mo (~$86)** | ~R$450 – 650 | Sum of the above; platform-wide, §5 |
| Payment fee — Pix | ~1% | R$1.99 flat – 1.2% | Cheapest lever; Asaas-style gateway |
| Payment fee — cartão | ~4.5% + R$0.49 | 3.5 – 4.99% | Recorrente; the biggest variable cost |
| Payment gateway | Asaas (no monthly fee) | Vindi/Iugu ~R$100–300/mo floor | BR recurring-billing |
| Tax on revenue | ~10% | 6% (Anexo III) – 15.5% (Anexo V) | Simples Nacional; **confirm w/ accountant** |
| **Recommended price — Solo** | **R$179/mo** (R$1.790/yr) | R$149 – 199 | §6.2 (code placeholder: R$199) |
| **Recommended price — Clínica** | **R$379/mo** (R$3.790/yr) | R$349 – 399 | §6.2 (code placeholder: R$399) |

Code references: `src/server/whatsapp-automations.ts`,
`drizzle/data/whatsapp-templates.json`, `src/server/dal/whatsapp.ts`,
`src/lib/image-compression.ts`, `src/server/r2.ts`,
`src/server/dal/student-checkins.ts`, `src/db/schema.ts` (row footprint:
`student_checkin`, `student_checkin_photo`, `whatsapp_message`, `notification`,
`student_diet_version`, `student_workout_version`).
