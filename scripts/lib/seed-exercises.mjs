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
  const baseRows = await query(
    "select code, opengym_id from exercise where code is not null and clinic_id is null",
  );
  const linkedCode = new Map(baseRows.map((r) => [r.code, r.opengym_id]));
  const takenRows = await query(
    "select opengym_id from exercise where opengym_id is not null",
  );
  const taken = new Set(takenRows.map((r) => r.opengym_id));

  let inserted = 0;
  let linked = 0;
  for (const e of exercises) {
    const openGymId = e.openGymId && !taken.has(e.openGymId) ? e.openGymId : null;
    if (!linkedCode.has(e.code)) {
      const rows = await query(
        `insert into exercise (
          code, name, search_text, category, level, force, mechanic, equipment,
          primary_muscles, secondary_muscles, instructions, images, image_credits, source, opengym_id
        ) values ($1, $2, unaccent(lower($2)), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        on conflict (code) do nothing
        returning id`,
        [
          e.code,
          e.name,
          e.category,
          e.level,
          e.force,
          e.mechanic,
          e.equipment,
          e.primaryMuscles,
          e.secondaryMuscles,
          e.instructions,
          e.images,
          JSON.stringify(e.imageCredits ?? {}),
          e.source ?? "free-exercise-db",
          openGymId,
        ],
      );
      if (rows.length === 0) continue;
      inserted++;
      if (openGymId) taken.add(openGymId);
      continue;
    }
    if (!openGymId || linkedCode.get(e.code) !== null) continue;
    const rows = await query(
      `update exercise set opengym_id = $1
       where code = $2 and clinic_id is null and opengym_id is null
       returning id`,
      [openGymId, e.code],
    );
    if (rows.length === 0) continue;
    linked++;
    taken.add(openGymId);
  }
  return { inserted, linked };
}

export async function seedExerciseSubstitutionEdges(query, rules) {
  const codeRows = await query("select id, code from exercise where code is not null");
  const idByCode = new Map(codeRows.map((r) => [r.code, r.id]));
  const edgeRows = await query(
    "select exercise_id, substitute_exercise_id from exercise_substitution where clinic_id is null",
  );
  const have = new Set(edgeRows.map((r) => `${r.exercise_id}:${r.substitute_exercise_id}`));

  const from = [];
  const to = [];
  let skipped = 0;
  for (const rule of rules) {
    const exerciseId = idByCode.get(rule.exercise);
    for (const subCode of rule.substitutes ?? []) {
      const substituteId = idByCode.get(subCode);
      if (!exerciseId || !substituteId || substituteId === exerciseId) {
        skipped++;
        continue;
      }
      const key = `${exerciseId}:${substituteId}`;
      if (have.has(key)) continue;
      have.add(key);
      from.push(exerciseId);
      to.push(substituteId);
    }
  }

  for (let i = 0; i < from.length; i += 500) {
    await query(
      `insert into exercise_substitution (clinic_id, exercise_id, substitute_exercise_id)
       select null, f, t from unnest($1::uuid[], $2::uuid[]) as u(f, t)`,
      [from.slice(i, i + 500), to.slice(i, i + 500)],
    );
  }
  return { inserted: from.length, skipped };
}
