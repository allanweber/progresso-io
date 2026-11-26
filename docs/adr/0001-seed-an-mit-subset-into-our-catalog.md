# Seed only an MIT subset of exercises, merged into our catalog

Superseded by [0003](0003-replace-the-exercise-catalog-with-a-full-external-catalogue.md).

We extend the base exercise catalog with 1,324 ExerciseDB-origin exercises from the MIT-licensed upstream (`hasaneyldrm/exercises-dataset`). We keep our own catalog and prescription model. An incoming exercise that matches one of our exercises is merged into our row: the row records the catalog id and keeps our pt-BR text and images. The other exercises become base exercises with no images and a pt-BR translation at build time.

## Considered Options

- **Replace our catalog and format with an external catalogue**: rejected. Every workout row refers to our exercise ids with `on delete restrict`, so the migration is large.
- **Take the full catalogue of about 6,554 exercises**: rejected until a legal review.
- **Add the 1,324 exercises as separate rows**: rejected. Coaches see duplicate exercises, one with images and one without.

## Consequences

- New exercises have no images.
- The export uses the catalog id of a base exercise, so a separate table to map the ids is not necessary.
