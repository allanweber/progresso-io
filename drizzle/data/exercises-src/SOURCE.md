# Exercise catalog — sources

The base exercise catalog is built by joining two open datasets that share the
same exercise `id` (873 rows in each, a perfect 1:1 join):

| File | Upstream | License | Used for |
| --- | --- | --- | --- |
| `free-exercise-db.json` | [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) (`dist/exercises.json`) | The Unlicense (public domain) | Stable enum values (category, level, force, mechanic, equipment, muscles) and the image keys. Also the source of the exercise **images**. |
| `exercicios-ptbr-full.json` | [joao-gugel/exercicios-bd-ptbr](https://github.com/joao-gugel/exercicios-bd-ptbr) (`exercises/exercises-ptbr-full-translation.json`) | Translation of the above | The Brazilian-Portuguese `name` and `instructions`. |

## Pipeline

1. `pnpm db:transform-exercises` — joins the two files on `id`, keeping PT-BR
   text from the translation and normalized enum slugs from free-exercise-db,
   and writes `drizzle/data/exercises-catalog.ndjson.gz` (the seed artifact).
2. `pnpm db:fetch-exercise-images` — downloads every image referenced by the
   artifact into `drizzle/data/exercises-images/<id>/<n>.jpg` (versioned in the
   repo, so the seed is self-contained and no CDN is hit at deploy time).
3. `pnpm db:upload-exercise-images` — uploads that local image folder to the
   Cloudflare R2 bucket the app serves images from (see `.env.example`).

The enum slugs emitted by the transformer are mirrored, with their PT-BR labels,
in `src/lib/exercises.ts`, exactly as the food catalog labels its nutrients.
