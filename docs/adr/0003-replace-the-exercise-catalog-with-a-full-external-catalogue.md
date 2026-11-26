# Replace the exercise catalog with a full external catalogue

This decision supersedes [0001](0001-seed-an-mit-subset-into-our-catalog.md).
The database and the application are created again, so the base exercise catalog
is now a full external catalogue (5,632 exercises), with its vocabulary, its
stills and its clips. pt-BR is the main language. We translated the pt-BR steps
and descriptions that the catalogue does not have. The catalog id is the `code`
of each exercise, so the data that maps the ids and the tools that maintain the
catalog are removed.

## Considered Options

- **Keep the MIT subset (decision 0001)**: rejected. The coaches need the full
  library, with the animations.
- **Keep our own vocabulary and map the catalogue to it**: rejected. The
  catalogue vocabulary is more precise (body part, target muscle, machine kind),
  and a mapping loses data.

## Consequences

- The deploy copies the media of the pinned catalogue commit to R2.
- The `level`, `force` and `mechanic` fields are removed, because the catalogue
  does not have them.
- The AI generator sends only the 1,324 classic exercises and the base
  exercises without a code as its cached prompt prefix. The full catalog is
  too large for the prompt (about 112,000 tokens).
