# Exercise catalog — sources

The base exercise catalog is built by joining two open datasets that share the
same exercise `id` (873 rows in each, a perfect 1:1 join):

| File | Upstream | License | Used for |
| --- | --- | --- | --- |
| `free-exercise-db.json` | [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) (`dist/exercises.json`) | The Unlicense (public domain) | Stable enum values (category, level, force, mechanic, equipment, muscles) and the image keys. Also the source of the exercise **images**. |
| `exercicios-ptbr-full.json` | [joao-gugel/exercicios-bd-ptbr](https://github.com/joao-gugel/exercicios-bd-ptbr) (`exercises/exercises-ptbr-full-translation.json`) | Translation of the above | The Brazilian-Portuguese `name` and `instructions`. |

These files are the provenance of the catalog. The curated result lives in
`../exercises-catalog.ndjson.gz` (see `docs/exercise-catalog.md`); the
maintenance tool (`pnpm db:maintain-exercises`) reads the PT-BR translation for
names.

## ExerciseDB (openGym ids)

`../exercisedb-src/exercisedb.json` holds the 1,324 ExerciseDB v1 exercises from
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)
(`data/exercises.json`), **text only**: id, name, body part, equipment, target,
secondary muscles and the English instructions. Their ids are the permanent
exercise ids of the openGym app. The media in that repository (© Gym visual) is
not covered by its MIT licence and is never fetched or stored here. See
`docs/adr/0001-seed-opengym-mit-subset-into-our-catalog.md`.

The maintenance tool reads this file, `exercisedb-ptbr.json` (PT-BR names,
instructions and enum classification for the unmatched ones) and
`../opengym-matches.json` (the free-exercise-db exercise each one matches) to
offer the openGym catalog when linking an exercise.

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
