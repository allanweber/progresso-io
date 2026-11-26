# Replace the exercise catalog with the full openGym catalogue

This decision supersedes [0001](0001-seed-opengym-mit-subset-into-our-catalog.md).
The database and the application are created again, so the base exercise catalog
is now the full openGym catalogue (5,632 exercises), with its vocabulary, its
stills and its clips. pt-BR is the main language. We translated the pt-BR steps
and descriptions that openGym does not have. The openGym id is the `code` of
each exercise, so the id-mapping data and the catalog maintenance tooling are
removed.

## Considered Options

- **Keep the MIT subset (decision 0001)**: rejected. The coaches need the full
  library, with the animations.
- **Keep our own vocabulary and map openGym to it**: rejected. The openGym
  vocabulary is more precise (body part, target muscle, machine kind), and a
  mapping loses data.

## Consequences

- The owner accepted the license risks that decision 0001 describes. The media
  is licensed by Gym visual to openGym only, and most of the catalogue text is
  AGPL.
- The deploy copies the media of the pinned openGym commit to R2.
- The `level`, `force` and `mechanic` fields are removed, because openGym does
  not have them.
- The AI generator sends only the 1,324 classic exercises and the base
  exercises without a code as its cached prompt prefix. The full catalog is
  too large for the prompt (about 112,000 tokens).
