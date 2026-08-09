# Anamneses base (seed)

Curated **base anamnesis templates** (`clinic_id NULL` — shared with every
clinic, read-only, copyable into a clinic's own). One file per template.
Hand-maintained: edit the JSON here directly. Loaded as base rows by the seed
(matched idempotently by `key`).

Each template covers a different **profile / objective**, because a real
nutritionist does not use one questionnaire for everyone. Two axes:

- **Objetivo** — emagrecimento, hipertrofia, saúde/reeducação, clínico, saúde
  da mulher.
- **Modalidade** — `in_person` asks for measurements/skinfolds taken in the
  office; `online` does **not** ask for skinfolds — the aluno self-reports
  weight and circumferences.

## Deliberately simple

No conditional logic, no scales, no multiple-choice options, no units metadata.
A question is just a **label** plus a basic **type**. Anything that would have
been a scale or a choice is asked as open text; anything with a follow-up is
merged into one open question ("Usa medicamentos? Quais?").

## Template shape

```jsonc
{
  "key": "emagrecimento-online",               // stable slug — the idempotent seed key
  "name": "Anamnese — Emagrecimento (online)",  // PT-BR title shown to the coach
  "description": "…",                           // one line, shown in the picker
  "objective": "weight_loss",                   // weight_loss | hypertrophy | health | clinical | womens_health
  "modality": "online",                         // in_person | online | any
  "sections": [ { …Section } ]
}
```

## Section shape

```jsonc
{
  "key": "identificacao",     // unique within the template
  "title": "Identificação",   // PT-BR
  "questions": [ { …Question } ]
}
```

## Question shape

Only three fields, always present:

```jsonc
{ "key": "peso", "type": "short_text", "label": "Peso atual (kg)" }
```

| field   | meaning                                     |
|---------|---------------------------------------------|
| `key`   | unique within the template                  |
| `type`  | `short_text` \| `long_text` \| `boolean`    |
| `label` | PT-BR question text                          |

### Question types

| type         | aluno input                        |
|--------------|------------------------------------|
| `short_text` | single-line text                   |
| `long_text`  | multi-line text                    |
| `boolean`    | Sim / Não                          |
