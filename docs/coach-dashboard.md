# Coach dashboard (`/coach`)

The screen a coach lands on after signing in. Four counted tiles over
per-channel cards: the coach reads the size of each pile at a glance, then drops
into whichever one they mean to work.

## Shape

```
┌──────────┬──────────┬──────────┬──────────┐
│ Alunos   │ Sem      │ Check-ins│ WhatsApp │   ← always four, always visible
│ ativos   │ treino/  │ pendentes│ aguard.  │
│          │ dieta    │          │          │
└──────────┴──────────┴──────────┴──────────┘
┌────────────────────────────┬──────────────┐
│ Check-ins aguardando resp. │ Hoje         │
├────────────────────────────┼──────────────┤
│ Sem treino ou dieta        │ Esta semana  │
├────────────────────────────┼──────────────┤
│ Rascunhos não publicados   │ WhatsApp     │
└────────────────────────────┴──────────────┘
   work you owe an aluno         time & talk
```

The left column (`1.4fr`) holds the three lists whose rows carry an avatar, a
name and a chip, and therefore want the width. The right column (`1fr`) holds
the agenda pair and the inbox, which read fine narrow. Below `lg` the two
columns stack; the tiles stay 2-up rather than becoming a 4-tall stack that
would bury every card.

## Data

`GET /api/coach/dashboard` returns each backlog as its own list — each has its
own count in the tile above it and its own destination in the card below it, so
there is nothing to merge. `students.getCoachDashboard` supplies the
tenant-scoped student backlogs; WhatsApp lives in its own DAL and is plan-gated;
the calendar is capability-gated the same way.

| Card | Source | Links to |
|---|---|---|
| Check-ins aguardando resposta | aluno check-in with `feedbackAt IS NULL` | `/coach/students/<id>/feedback` |
| Sem treino ou dieta | active aluno with no published treino **or** dieta | `/coach/students/<id>` |
| Rascunhos não publicados | `student_{diet,workout}_version` still `status = 'draft'` | `/coach/students/<id>/{diet,workout}` |
| Hoje / Esta semana | calendar items, today and through Saturday | `/coach/calendar` |
| WhatsApp aguardando | conversation with unanswered inbound | `/coach/whatsapp?c=<conversationId>` |

Every list is capped at `DASHBOARD_LIST_LIMIT` (50) in the DAL; WhatsApp is
capped at 5 by `listWaiting`'s default. The dashboard shows a queue, never an
archive.

### Why drafts get a card

A draft is invisible to the aluno by design — nothing reaches them until the
coach publishes. That makes a forgotten draft the one kind of work nothing else
in the product nags about: it does not appear on the aluno's screen, it sends no
notification, and it never expires loudly. The card is the only place it
surfaces. Its rows read `dieta · editado há 3 dias` and carry a `publicar` chip.

`updatedAt` is a real instant, so the label says minutes when it means minutes.
Rounding it up to "hoje" would put a draft touched five minutes ago beside one
touched at dawn.

## States

- **Error** — a failed fetch returns early into a `role="alert"` panel with the
  message and a retry. It must never fall through to the empty branches: a coach
  on bad gym signal reading four zeros and "nenhum check-in aguardando" puts the
  phone away. `e2e/dashboard.spec.ts` guards this, asserting that no tile and no
  card renders while the load is broken.
- **First run** (`activeCount === 0`) — six "nothing here" messages teach a coach
  nothing on the highest-stakes screen of their trial, so the whole body is
  replaced by the three-step ritual the product is built on: convide → rascunho
  → publique.
- **Loading** — each card shows one `aria-busy` line; the tiles show `…`, never a
  premature `0`.
- **Empty** — each card states its own good news in words ("Todos os alunos
  ativos têm treino e dieta."). A tile's zero is left as a plain figure in
  `text-foreground`; only a non-zero count takes the danger or brand colour.

## Rules this screen keeps

- No card promises a feature that does not exist. The old *Peso destoando da
  meta* placeholder rendered a permanent "Em breve" and is retired; the spec
  asserts `Em breve` has zero matches.
- Kind is always named in words — `sem treino`, `sem dieta`, `responder`,
  `publicar`, `atrasado` — never encoded by colour alone.
- Every row links to the **task**, never to an index the coach must search.
- The KPI figure uses the named `figure` rung (30px, structural, holds across
  postures) and `tabular-nums`, so the row does not jitter on refetch.
- The tile row is a `<dl>`: a screen reader announces "Sem treino/dieta, 3" as
  one pair, and each figure carries a stable `#kpi-<slug>` handle.
