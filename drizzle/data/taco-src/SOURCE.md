# TACO source data

Normalized CSVs of the **Tabela Brasileira de Composição de Alimentos (TACO),
4ª edição — NEPA/UNICAMP (2011)**, taken from the MIT-licensed pipeline at
[`brolesi/taco`](https://github.com/brolesi/taco) (`data/processed/taco/`).

- `taco_composicao.csv` — 597 foods: proximate composition, 9 minerals, 8 vitamins.
- `taco_acidos_graxos.csv` — fatty-acid profile (423 foods).
- `taco_aminoacidos.csv` — amino-acid profile (26 foods).

Convention: an empty cell is an unmeasured value (→ NULL); `1e-05` is a measured
trace ("Tr", below the quantification limit) → NULL + `is_trace = true`.

Run `npm run db:transform-taco` to regenerate `drizzle/data/taco-catalog.ndjson.gz`.
