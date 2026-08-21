---
target: /coach
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
timestamp: 2026-08-21T09-49-17Z
slug: src-app-coach-page-tsx
---
Method: dual-agent (A: design review, isolated · B: detector + browser evidence, isolated).
Provenance note: A's first run died (ECONNRESET), B's first run stalled. B's evidence entered the
parent synthesis context before A's retry finished; A ran fresh and isolated so its judgment is
unanchored, but the preferred parent-context ordering was not preserved.
Browser capture BLOCKED: e2e/.auth/coach.json session row gone from DB (cookie live until Aug 26,
server rejected it) -> Playwright landed on /login. No screenshots. No overlay (this skill version
ships no in-page detect.js). All visual claims are reasoned from source, unverified against pixels.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | ["coach-dashboard"] (page.tsx:128) has no staleTime/refetchInterval/refetchOnWindowFocus while rail badge polls 30s (dashboard-shell.tsx:148); counts disagree |
| 2 | Match System / Real World | 3 | Vocabulary right; same list named "Sem treino/dieta" (tile) vs "Sem treino ou dieta" (card) |
| 3 | User Control and Freedom | 2 | Every row is one-way navigation; nothing answered/snoozed/dismissed in place; banner non-dismissible 14 days |
| 4 | Consistency and Standards | 2 | Typography drifted (36 off-ramp sizes) BUT shadow+motion systems provably exact; raised from A's 1 on detector evidence |
| 5 | Error Prevention | 2 | At-limit guard is a disabled button whose only explanation is a title attr (page.tsx:163-164) |
| 6 | Recognition Rather Than Recall | 2 | Calendar category encoded solely by 10px color dot that is aria-hidden (page.tsx:103-107) |
| 7 | Flexibility and Efficiency | 1 | No skip link, no shortcuts, KPI tiles inert divs, zero limit() in getCoachDashboard (server/dal/students.ts:199) |
| 8 | Aesthetic and Minimalist Design | 2 | Nine top-level blocks; one placeholder; four restate badges below them |
| 9 | Error Recovery | 1 | isError handled in exactly 1 of 5 cards (page.tsx:411); other four render EMPTY state on failure |
| 10 | Help and Documentation | 1 | Zero onboarding/first-run guidance on the landing screen |
| **Total** | | **18/40** | **Poor band (12-19)** |

All ten heuristics apply (Operate surface); none n/a.
Band caveat: failures are concentrated and fixable, not diffuse. 4 of 5 priority issues are bounded
edits to one file. Underlying system is in unusually good shape.

## Design Specificity Verdict

Mostly category-default with product vocabulary on top. Composition (4-up KPI row page.tsx:181 +
lg:grid-cols-[1.4fr_1fr] page.tsx:239) would serve a CRM or helpdesk unchanged.

Product-authored: "Sua fila de hoje" framing; pt-BR date eyebrow computed post-mount to dodge TZ
hydration mismatch (page.tsx:23-41); deep-link check-in -> /coach/students/${id}/feedback
(page.tsx:268), skipping the record to reach the task.

Three load-bearing product ideas MISSING from the landing screen:
- WhatsApp (declared the spine) is a read-only preview in slot 3; every row links to the index.
  conversationId exists in DTO (lib/coach-dashboard.ts:34), spent as React key + avatar seed
  (page.tsx:368,377), never as a link.
- Draft vs published (PRODUCT principle 2, "make that boundary unmistakable") appears nowhere.
- Weekly check-in cadence (the "heartbeat", computeCheckinDue exists) rendered as a flat undated
  backlog. No "4 alunos vencem quinta."

### Deterministic scan
36 findings, exit 2, across src/app/coach + src/components/dashboard. ALL one rule:
design-system-font-size, advisory. No critical/serious/a11y/perf findings.
Values: 11px x24, 28px x5, 15px x5, 20px x1, 17px x1. Zero false positives (nothing flagged at
13px/12px/10px, the real ramp steps).

Three characters of drift:
- 11px = undocumented 8th step between label(12) and eyebrow(10), doing their jobs. 47 uses in src.
- 15px CONTRADICTS a documented step: all five are font-heading font-semibold panel titles incl.
  SectionCard's own h2 (page.tsx:58). DESIGN.md assigns that role to Title/18px. Page has no Title rung.
- 28px is systematic: five identical text-2xl ... sm:text-[28px] h1s. Fix is arguably to DOCUMENT
  headline as 24px -> 28px @sm, not change code.

### Detector CORRECTED the design review
DESIGN.md's own two self-verification greps both pass exactly:
- shadows: 184 / 6 / 1 / 1 (Rest, Overlay, Overlay-upward, Theatre) = exactly four values
- motion: 0 hover:shadow, 0 hover:translate-y, exactly 2 transition-all, 138 transition-colors
Matches DESIGN.md's stated counts to the digit. No-Lift Rule and Stillness Rule factually intact
codebase-wide. TYPOGRAPHY IS THE ONLY DRIFTED SYSTEM. Consistency score raised 1 -> 2.

## What's Working
1. Row anatomy excellent + rigorously consistent: avatarColor(id) circle, semibold name, one metric,
   status chip at end. Identical across all three real lists (page.tsx:270-288, 421-455, 366-389).
   Variable info at fixed x-positions -> learn the shape once, read it everywhere.
2. Deep-linking to the task, not the record (page.tsx:268).
3. Capability gating quiet + non-punitive: calendar/WhatsApp nav absent on Free
   (dashboard-shell.tsx:73-87), API returns empty arrays not errors. Implements "limits nudge,
   they never punish" correctly.

## Priority Issues

### [P0] A failed fetch renders as "everything is fine"
isError checked in 1 of 5 cards (page.tsx:411). Other four fall through to EMPTY state; all four KPI
tiles render 0. Verified: five isLoading guards, one isError.
Why: coach on bad wifi sees four zeros + "Nenhum check-in aguardando resposta. 🎉" and pockets the
phone. Alunos wait a day for feedback already submitted. PRODUCT commits to "assume a cheap Android
on bad signal."
Fix: lift error handling to page level; if isError replace tile row + card grid with one panel
("Nao conseguimos carregar seus dados" + Tentar de novo -> refetch()). Never render 0 or an empty
state from a failed query. Add retry, staleTime, refetchOnWindowFocus.
Command: /impeccable harden src/app/coach/page.tsx

### [P1] The accessibility floor is broken in three places
(a) focus:outline-none with NO replacement on mobile menu trigger (dashboard-shell.tsx:331) and
SheetClose (:313) - verified, no focus-visible: anywhere in that file. DESIGN.md says the focus ring
is "Never removed".
(b) text-destructive #ef4444 on #FEE2E2 at 11px semibold (page.tsx:117,445,450) ~= 3.3:1, under 4.5:1
- and these are the URGENT chips.
(c) At-limit explanation is a title attr on a disabled button = removed from tab order entirely.
No visible reason, no upgrade route -> the punishing behavior PRODUCT principle 5 forbids.
Fix: focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 on both; darken chip
text to #B91C1C (~5.9:1) or drop the wash; replace disabled button with enabled one opening the
Assinar dialog, labelled "Limite de N alunos - fazer upgrade".
Command: /impeccable audit src/app/coach/page.tsx src/components/dashboard/dashboard-shell.tsx

### [P1] First-run celebrates emptiness and teaches nothing
Empty clinic reads: four zeros, "Nenhum check-in aguardando resposta. 🎉", grey "Em breve" chip,
"Nada agendado para hoje.", "Nada agendado para o restante da semana.", "Nenhuma conversa aguardando
resposta.", "Todos os alunos ativos tem treino e dieta. 🎉" = six emptiness statements + two
party-poppers congratulating a coach for zero alunos.
Why: highest-stakes 30 seconds in the product's life - new coach on a 14-day clock deciding on
R$179/month. The 🎉 at zero alunos reads as sarcasm. Trial banner adds an AlertCircle (alert glyph,
good news), non-dismissible, 14 days.
Fix: branch on activeCount === 0, replace whole grid with one panel: "Comece convidando seu primeiro
aluno" + one primary button + three-step line naming the ritual (convide -> monte o treino em
rascunho -> publique e o aluno recebe no WhatsApp). Drop both 🎉 (they also render in the system
emoji font, outside the two-font system).
Command: /impeccable onboard src/app/coach/page.tsx

### [P1] Every number is divorced from its list
Four KPI tiles restate counts whose lists are on the same page at maximum distance: "Sem treino/dieta"
is tile #2 (page.tsx:202), its list is the LAST card (:397). Tiles are inert divs, not links.
Section headers already carry the same count as a badge (:245-249) -> pure duplication.
Fix: delete the tile row, let section titles carry counts. If a summary strip is wanted, make each
tile a link placed directly above the list it counts.
Command: /impeccable distill src/app/coach/page.tsx

### [P1] WhatsApp - the declared spine - is a read-only preview
Every WhatsApp row links to the index despite conversationId being in the DTO.
Fix: deep-link to /coach/whatsapp?c=${c.conversationId} (one line). Then consider promoting the
conversation queue to the wide left column.
Command: /impeccable layout src/app/coach/page.tsx

## Persona Red Flags

Alex (power user, 50 alunos): zero limit() in getCoachDashboard - verified. 20 check-ins = 20 rows
at ~62px pushing last card ~1400px down; no cap/pagination/"ver os 20". Nine tab stops before first
row, no skip link. The four biggest visual targets (text-3xl numbers) are inert divs. No multi-select
/sort/filter-by-overdue; 20 check-ins = 20 round trips each refetching full payload (staleTime unset).
"Sem treino/dieta" vs "Sem treino ou dieta" costs a re-read every scan.

Sam (screen reader/keyboard/contrast): focus vanishes in the mobile drawer - where a keyboard user is
most trapped. Badge counts (page.tsx:246,350,401) announce as orphan "3" with no aria-label, although
the pattern is done correctly in the nav rail (dashboard-shell.tsx:283) - skipped, not unknown. KPI
tiles are anonymous sibling divs, no <dl>/aria-labelledby. Calendar type color-only + aria-hidden.
Five <section>s with no aria-labelledby -> landmark nav gets nothing. Banner role="status"
re-announces the trial pitch on every page mount for 14 days.

Phone-first coach: on 390px the queue is BELOW THE FOLD on the screen named "Sua fila de hoje" -
header ~56 + banner stacked 2 rows ~72 + page header wrapped buttons ~110 + grid-cols-2 tiles ~180
= ~420px before the first check-in row. Third thing scrolled past is the "Em breve" placeholder,
daily. Primary action in top-right = furthest from a right thumb, against the binding "reachable
primary actions" commitment. No pull-to-refresh, no refetchInterval, no staleness indicator.
(Measured from source; browser capture blocked, unverified against pixels.)
Row targets are FINE: px-4 py-3 around size-9 avatar ~= 60px.

## Minor Observations
- Uppercase Licence broken at page.tsx:150: text-xs uppercase tracking-wide (12px); DESIGN.md
  reserves uppercase for the 10px eyebrow at 0.08em only.
- #FEE2E2 is not in the design system (DESIGN.md names #ef4444, no red wash). Used 5x. #B45309
  diverges from documented warn-fg #92400e.
- Rest shadow pasted as a literal 5x rather than tokenized -> guarantees future drift.
- Rhythm off-system: DESIGN.md specifies 24px padding/gaps; dashboard uses p-4, px-4 py-3.5, gap-3.
  May be correct for this screen but undocumented -> next dashboard will guess differently.
- Status chips all-lowercase (responder, atrasado) = a third case convention.
- WhatsApp tile number turns text-primary on backlog (page.tsx:230) - emerald marking a backlog
  inverts the Alive Rule.
- Hoje and Esta semana are two cards for one idea; only Hoje has a "ver agenda" link.
- Out of scope but adjacent in src: text-[32px] x4, text-[22px] x9, text-[26px] x2, text-[8px] x1.

## Questions to Consider
1. Titled "Sua fila de hoje" but contains five parallel inboxes. What if it were literally ONE ranked
   list - overdue check-ins + unanswered WhatsApp + alunos without a plan, merged and sorted by how
   long they've waited, one action per row? What is lost besides the tile row?
2. If WhatsApp is the spine, what is it doing in the narrow column? What if the primary column IS the
   conversation queue with inline reply, so the coach never leaves /coach?
3. Draft-vs-published is the core ritual and is invisible here. Would "3 treinos em rascunho, 2 ha
   mais de 5 dias" instantly become the most valuable card - and does its absence suggest the screen
   was designed from a mockup rather than from the product's model?
4. What survives if this screen must fit one 390px viewport with zero scrolling? Probably: today's
   date, one number, one ranked list.
