# Exercise catalog

The exercise catalog is the shared base library of the app. It comes from an
external catalogue, pinned to one commit (the commit constant in
`src/lib/exercises.ts`). Each clinic
sees the base library and its own custom exercises. A clinic never sees the
custom exercises of a different clinic.

## Data

The catalog has 5,632 exercises. Each exercise has these data:

- The catalog id as `code`. The id never changes, so seed data and exports use it.
- The name, the description and the steps in pt-BR (the main language) and in English.
- The body part, the type (`category`), the equipment and the main muscle (`target`).
- The secondary muscles, and the muscles that the body map draws, with a weight for each muscle.
- The machine (`machineKind`) when the equipment is a machine.
- `needs` (a bench or a pull-up bar), `hold` (an exercise done for time) and `track` (an exercise done for distance).
- A still (`still/<id>.webp`) and a looped clip (`clip/<id>.mp4`).
- A second still and clip on a female figure for 935 exercises.
- `classic`: true for the 1,324 classic exercises of the catalogue
  (`classic-ids.json` in `drizzle/data/`).
- `popularity`: the "everyday" score of the catalogue. The score adds points for the
  44 gym staples, for a classic exercise, for common equipment and for a
  strength type. It removes points for stretching, mobility, yoga and rehab.

The library lists the exercises with the highest `popularity` first. A search
sorts by the similarity of the name first, and then by `popularity`. The AI
generator gets only the classic exercises (about 26,000 tokens).

The vocabulary is the vocabulary of the catalogue. The values are in `src/lib/exercises.ts`,
together with their pt-BR labels. The database has a CHECK constraint for each list.

### Pipeline

1. The pt-BR text is in `exercises-ptbr.json` in `drizzle/data/`. The catalogue has
   pt-BR names for all exercises, but pt-BR steps for only part of them. We
   translated the other steps and all the descriptions.
2. `node scripts/build-exercise-catalog.mjs <catalogue/exercises directory>`
   writes `drizzle/data/exercises-catalog.ndjson.gz` and
   `drizzle/data/exercise-substitutions.json`.
3. At deploy, `scripts/migrate.mjs` inserts the catalog and the substitutions.
   The insert uses the `code`, so a second run inserts nothing.

To move to a new catalogue commit, change the commit constant in `src/lib/exercises.ts`
and in `scripts/upload-exercise-images.mjs`. Then run the build script again.

### Size

The `exercise` table uses about 15 MB (9 MB of data and 6 MB of indexes).
The `exercise_substitution` table uses about 5.5 MB. The media is not in the
database: the stills and the clips use about 200 MB in R2.

## Media

The media is not in the repository. At deploy, `scripts/upload-exercise-images.mjs`
copies each still and clip from the pinned catalogue commit to the R2 bucket. A
manifest object for the commit stops a second upload. The app loads the media
only from `NEXT_PUBLIC_EXERCISE_IMAGE_BASE_URL`. When this variable is empty,
the app shows no media.

A female student sees the female figure when the exercise has one
(`workoutForSex` in `src/lib/workouts.ts`). All other users see the default figure.

## Custom exercises

A coach can create an exercise for the clinic. A platform admin can create a
base exercise. The form asks for the name, the body part, the main muscle, the
type and the equipment. A machine also needs the machine kind. A custom exercise
can have one photo. The DAL calculates the body map from the main muscle and the
secondary muscles.

## Substitutions

The build script makes up to four base substitutes for each exercise. A
substitute has the same main muscle and a similar type. The score prefers:

1. The reviewed exercise families (for example, the flat press family).
2. Movement words that the English names share.
3. The same body part, and shared secondary muscles.

Two of the four substitutes use a different equipment when possible. A clinic
can add its own substitutes. The base substitutes stay read-only for a coach.

## openGym export

A workout exports to an openGym plan file. A base exercise uses its catalog id.
A clinic exercise goes to `customEx`, with its body part, equipment, main muscle
and body map.

## UI

The catalog screens have these parts:

- A search field with the number of results, and a switch between rows and cards.
- A row of chips: "Filtros" (type and equipment, only the values that have
  results), the active filters, and the body parts.
- Each row shows the still, the name, and "main muscle · equipment".
- The detail shows the looped clip, the tags (equipment, body part, muscle
  shares), the description, the body map, the steps, and the substitutes. A
  button shows the English text.
