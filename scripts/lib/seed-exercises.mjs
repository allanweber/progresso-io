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
      code, name, name_en, search_text, description, category, level, force, mechanic, equipment,
      primary_muscles, secondary_muscles, instructions, instructions_en, images, image_credits, source, opengym_id
    )
    select
      e.code, e.name, e.name_en, unaccent(lower(concat_ws(' ', e.name, e.name_en))), e.description,
      e.category, e.level, e.force, e.mechanic, e.equipment,
      array(select jsonb_array_elements_text(e.primary_muscles)),
      array(select jsonb_array_elements_text(e.secondary_muscles)),
      array(select jsonb_array_elements_text(e.instructions)),
      array(select jsonb_array_elements_text(e.instructions_en)),
      array(select jsonb_array_elements_text(e.images)),
      e.image_credits, e.source, e.opengym_id
    from jsonb_to_recordset($1::jsonb) as e(
      code text, name text, name_en text, description text, category text, level text, force text,
      mechanic text, equipment text, primary_muscles jsonb, secondary_muscles jsonb, instructions jsonb,
      instructions_en jsonb, images jsonb, image_credits jsonb, source text, opengym_id text
    )
    on conflict (code) do nothing
    returning id`,
    [
      JSON.stringify(
        exercises.map((e) => ({
          code: e.code,
          name: e.name,
          name_en: e.nameEn ?? null,
          description: e.description ?? null,
          category: e.category,
          level: e.level,
          force: e.force ?? null,
          mechanic: e.mechanic ?? null,
          equipment: e.equipment ?? null,
          primary_muscles: e.primaryMuscles,
          secondary_muscles: e.secondaryMuscles ?? [],
          instructions: e.instructions ?? [],
          instructions_en: e.instructionsEn ?? [],
          images: e.images ?? [],
          image_credits: e.imageCredits ?? {},
          source: e.source,
          opengym_id: e.openGymId ?? null,
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
