import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export function readExerciseCatalog(path) {
  return gunzipSync(readFileSync(path))
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export async function seedExerciseCatalog(query, exercises) {
  const rows = await query(
    `insert into exercise (
      code, name, name_en, description, description_en, body_part, category, equipment, machine_kind, target, secondary_muscles, map_primary, map_secondary, muscle_weights, needs, hold, track, instructions, instructions_en, image, video, female_image, female_video, classic, popularity, search_text, source
    )
    select
      e.code, e.name, e.name_en, e.description, e.description_en, e.body_part, e.category, e.equipment, e.machine_kind, e.target, array(select jsonb_array_elements_text(e.secondary_muscles)), array(select jsonb_array_elements_text(e.map_primary)), array(select jsonb_array_elements_text(e.map_secondary)), e.muscle_weights, array(select jsonb_array_elements_text(e.needs)), e.hold, e.track, array(select jsonb_array_elements_text(e.instructions)), array(select jsonb_array_elements_text(e.instructions_en)), e.image, e.video, e.female_image, e.female_video, e.classic, e.popularity,
      unaccent(lower(concat_ws(' ', e.name, e.name_en))), 'opengym'
    from jsonb_to_recordset($1::jsonb) as e(
      code text, name text, name_en text, description text, description_en text, body_part text, category text, equipment text, machine_kind text, target text, secondary_muscles jsonb, map_primary jsonb, map_secondary jsonb, muscle_weights jsonb, needs jsonb, hold boolean, track text, instructions jsonb, instructions_en jsonb, image text, video text, female_image text, female_video text, classic boolean, popularity integer
    )
    on conflict (code) do nothing
    returning id`,
    [
      JSON.stringify(
        exercises.map((e) => ({
          code: e.code ?? null,
          name: e.name ?? null,
          name_en: e.nameEn ?? null,
          description: e.description ?? null,
          description_en: e.descriptionEn ?? null,
          body_part: e.bodyPart ?? null,
          category: e.category ?? null,
          equipment: e.equipment ?? null,
          machine_kind: e.machineKind ?? null,
          target: e.target ?? null,
          secondary_muscles: e.secondaryMuscles ?? null,
          map_primary: e.mapPrimary ?? null,
          map_secondary: e.mapSecondary ?? null,
          muscle_weights: e.muscleWeights ?? {},
          needs: e.needs ?? null,
          hold: e.hold ?? null,
          track: e.track ?? null,
          instructions: e.instructions ?? null,
          instructions_en: e.instructionsEn ?? null,
          image: e.image ?? null,
          video: e.video ?? null,
          female_image: e.femaleImage ?? null,
          female_video: e.femaleVideo ?? null,
          classic: e.classic ?? false,
          popularity: e.popularity ?? 0,
        })),
      ),
    ],
  );
  return { inserted: rows.length };
}

export async function seedExerciseSubstitutionEdges(query, rules) {
  const rows = await query(
    `insert into exercise_substitution (clinic_id, exercise_id, substitute_exercise_id)
     select null, x.id, s.id
     from jsonb_to_recordset($1::jsonb) as r(exercise text, substitute text)
     join exercise x on x.code = r.exercise and x.clinic_id is null
     join exercise s on s.code = r.substitute and s.clinic_id is null
     where x.id <> s.id
     on conflict do nothing
     returning id`,
    [
      JSON.stringify(
        rules.flatMap((r) => (r.substitutes ?? []).map((substitute) => ({ exercise: r.exercise, substitute }))),
      ),
    ],
  );
  return { inserted: rows.length };
}
