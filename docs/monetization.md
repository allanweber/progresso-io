# Monetization & unit economics

A business-planning document for the **variable cost of serving a customer** on
Progresso. It models the two usage-driven costs the platform incurs on each
clinic's behalf — **WhatsApp template messaging** (Meta charges) and **photo
storage** (Cloudflare R2) — for the two reference customers:

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

## 4. Combined variable COGS per customer

Realistic monthly cost (base rates, full messaging + Year-1 storage). "Postgres"
here is the *marginal* per-customer share; the real bill is the fixed instance:

| Customer | WhatsApp/mo | R2 photos/mo | Postgres/mo | **Total/mo** | ≈ BRL/mo |
| --- | --- | --- | --- | --- | --- |
| **Solo (50)** | $2.54 – $4.26 | ~$0.04 | ~$0.01 (or fixed share) | **~$2.6 – $4.3** | **~R$14 – R$24** |
| **Clínica (100)** | $5.06 – $8.54 | ~$0.08 | ~$0.02 (or fixed share) | **~$5.1 – $8.6** | **~R$28 – R$47** |

**Takeaway:** usage-driven variable cost is **trivial** — under **R$1/student/mo**
even at the full messaging + storage + DB load. Per-customer COGS is dominated by
**fixed infrastructure** (the app server + the Postgres *instance*), not the
per-customer messaging, blob, or relational data. The only scenarios that move
the needle are (a) templates reclassified as **Marketing** (~8× messaging), (b)
routing through a **BSP markup**, or (c) outgrowing the Postgres instance's
*compute* (scale the tier — a step cost, not a per-customer one). All manageable
by design.

---

## Assumptions & sources

| Input | Value used | Source / note |
| --- | --- | --- |
| Feedback cadence | Weekly (`semanal`) | Heaviest cadence; product default |
| Weeks per month | 4.33 | 52 ÷ 12 |
| Solo cap | 50 students | Plan limit |
| Clínica cap | 100 students, 3 coaches | Plan limit |
| Diet/workout publish | ~1×/mo each per student | Assumption — adjust to taste |
| Meta Utility (BR) | ~$0.0080/msg | Approx; verify Meta rate card |
| Meta Marketing (BR) | ~$0.0625/msg | Approx; sensitivity only |
| BRL/USD | ~R$5.50 | Approx; FX-dependent |
| Compressed photo | ~250 KB (base), 500 KB (heavy) | 1600px WebP q0.72; 3 MB server cap |
| Photos per check-in | 4 | `student_checkin_photo` poses |
| R2 storage | $0.015/GB-mo, egress free | Approx; verify Cloudflare pricing |
| Postgres row footprint | ~30 KB/student/mo (on disk) | Row width + indexes + ~20% bloat |
| Managed Postgres | fixed instance ($15–25/mo) + $0.125–0.35/GB-mo overage | Approx; Supabase/Neon/RDS/DO |

Code references: `src/server/whatsapp-automations.ts`,
`drizzle/data/whatsapp-templates.json`, `src/server/dal/whatsapp.ts`,
`src/lib/image-compression.ts`, `src/server/r2.ts`,
`src/server/dal/student-checkins.ts`, `src/db/schema.ts` (row footprint:
`student_checkin`, `student_checkin_photo`, `whatsapp_message`, `notification`,
`student_diet_version`, `student_workout_version`).
