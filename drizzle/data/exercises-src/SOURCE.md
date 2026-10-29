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

## ExerciseDB (openGym ids)

`../exercisedb-src/exercisedb.json` holds the 1,324 ExerciseDB v1 exercises from
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)
(`data/exercises.json`), **text only**: id, name, body part, equipment, target,
secondary muscles and the English instructions. Their ids are the permanent
exercise ids of the openGym app. The media in that repository (© Gym visual) is
not covered by its MIT licence and is never fetched or stored here. See
`docs/adr/0001-seed-opengym-mit-subset-into-our-catalog.md`.

1. `pnpm db:fetch-exercisedb` — downloads the dataset and writes the text-only copy.
2. `pnpm db:match-opengym-exercises` — proposes, for each ExerciseDB exercise, the
   free-exercise-db exercise that is the same one (exact name match, else Claude
   via OpenRouter picking among heuristic candidates) into
   `../opengym-matches.json`. Reviewed by hand; a match is fixed by editing `code`.
3. `pnpm db:enrich-exercisedb` — for the unmatched ones, Claude writes the PT-BR
   name and instructions and classifies them into our enums, into
   `../exercisedb-src/exercisedb-ptbr.json`. Reviewed by hand.
4. `pnpm db:transform-exercises` then `pnpm db:build-exercise-substitutions` — the
   catalog artifact gains `openGymId` on matched rows and the new rows
   (`code` = `exercisedb-<id>`, no images).

Steps 2 and 3 resume where they stopped and need `LLM_API_KEY`.

## wger images (ExerciseDB exercises)

61 ExerciseDB exercises are illustrated with images from [wger](https://wger.de),
licensed CC-BY-SA 3.0/4.0 (attribution + share-alike; a few are AI-generated and
flagged so). Each image keeps its original file, and its author, licence and wger
page are stored in `exercise.image_credits` and shown under the exercise's images.

1. `../wger-matches.json` — hand-reviewed pairs of an image-less ExerciseDB
   exercise and the wger exercise that is the same movement. Only exact
   equivalents are listed; a variant (other equipment, grip or stance) is not.
2. `pnpm db:fetch-wger-images` — reads the wger API and writes
   `../wger-images.json` (up to 2 images per exercise: key, source URL, credit).
3. `pnpm db:transform-exercises` — puts those keys and credits on the rows.

`pnpm db:fetch-exercise-images` and the R2 upload take each wger key from its
wger URL and every other key from free-exercise-db.

```
MIT License

Copyright (c) 2026 Hasan Emir Yıldırım

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation and data files (the "Software"),
to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The upstream instruction text originates from ExerciseDB v1 by AscendAPI, under
the same MIT terms.

The enum slugs emitted by the transformer are mirrored, with their PT-BR labels,
in `src/lib/exercises.ts`, exactly as the food catalog labels its nutrients.
