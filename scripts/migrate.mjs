// Applies the Drizzle SQL migrations in ./drizzle to DATABASE_URL, then seeds
// the base food catalog, then exits. Uses drizzle-orm's programmatic migrator
// (no drizzle-kit needed at runtime). Idempotent: already-applied migrations
// are tracked and skipped, and the catalog seed no-ops once `food` is populated.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { uploadExerciseImages } from "./upload-exercise-images.mjs";

const CATALOG = "./drizzle/data/taco-catalog.ndjson.gz";
const SUPPLEMENT = "./drizzle/data/taco-supplement.json";
const SUBSTITUTIONS = "./drizzle/data/taco-substitutions.json";
const MEASURES = "./drizzle/data/food-measures.json";
const EXERCISES = "./drizzle/data/exercises-catalog.ndjson.gz";
const EXERCISE_SUBS = "./drizzle/data/exercise-substitutions.json";
const WHATSAPP_TEMPLATES = "./drizzle/data/whatsapp-templates.json";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — cannot run migrations.");
  process.exit(1);
}

/**
 * Loads the base TACO catalog (`drizzle/data/taco-catalog.ndjson.gz`, produced
 * by scripts/transform-taco.mjs) into the empty catalog tables. Idempotent:
 * skips when `food` already has rows, so it's safe on every deploy. `search_text`
 * is computed with `unaccent(lower(...))` so the trigram search is accent-blind.
 */
async function seedCatalog(sql) {
  const [{ count }] = await sql`select count(*)::int as count from food`;
  if (count > 0) {
    console.log(`✓ Food catalog already seeded (${count} foods) — skipping.`);
    return;
  }

  let text;
  try {
    text = gunzipSync(readFileSync(CATALOG)).toString("utf8");
  } catch {
    console.log(`• No catalog artifact at ${CATALOG} — skipping catalog seed.`);
    return;
  }

  const lines = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const meta = lines[0];
  const foods = lines.slice(1);

  for (const g of meta.groups) {
    await sql`insert into food_group (name, slug) values (${g.name}, ${g.slug}) on conflict do nothing`;
  }
  for (const n of meta.nutrients) {
    await sql`insert into nutrient (id, label, unit, kind, sort_order)
              values (${n.id}, ${n.label}, ${n.unit}, ${n.kind}, ${n.sortOrder})
              on conflict do nothing`;
  }
  const groupRows = await sql`select id, slug from food_group`;
  const groupId = new Map(groupRows.map((r) => [r.slug, r.id]));

  await sql.begin(async (tx) => {
    for (const f of foods) {
      const id = crypto.randomUUID();
      await tx`
        insert into food (
          id, code, description, search_text, group_id, type, source,
          energy_kcal, protein, carbohydrate, fat, fiber, sodium, needs_review
        ) values (
          ${id}, ${f.code}, ${f.description}, unaccent(lower(${f.description})),
          ${groupId.get(f.groupSlug)}, ${f.type}, 'TACO',
          ${f.energyKcal}, ${f.protein}, ${f.carbohydrate}, ${f.fat},
          ${f.fiber}, ${f.sodium}, ${f.needsReview}
        )`;
      if (f.nutrients.length > 0) {
        const rows = f.nutrients.map(([nutrient_id, value, is_trace]) => ({
          food_id: id,
          nutrient_id,
          value,
          is_trace,
        }));
        await tx`insert into food_nutrient ${tx(rows)}`;
      }
    }
  });

  console.log(`✓ Food catalog seeded: ${foods.length} foods.`);
}

/**
 * Loads the base-catalog supplement (`drizzle/data/taco-supplement.json`):
 * common diet staples the TACO base lacks, sourced from the TBCA / USDA. They
 * become shared base foods (no clinic), reusing the groups and nutrients the
 * TACO seed already created. Idempotent and independent of the catalog skip:
 * each food is keyed by its unique `code`, so `on conflict do nothing` lets this
 * top up an already-seeded (TACO-only) database and re-run safely on every
 * deploy. Runs after {@link seedCatalog}, so the groups/nutrients it references
 * already exist. Nutrient rows are filtered to ids present in `nutrient` so a
 * stray id can never break the foreign key.
 */
async function seedSupplement(sql) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(SUPPLEMENT, "utf8"));
  } catch {
    console.log(`• No supplement at ${SUPPLEMENT} — skipping supplement seed.`);
    return;
  }
  const foods = doc.foods ?? [];
  if (foods.length === 0) return;

  const groupRows = await sql`select id, slug from food_group`;
  const groupId = new Map(groupRows.map((r) => [r.slug, r.id]));
  const nutrientRows = await sql`select id from nutrient`;
  const validNutrient = new Set(nutrientRows.map((r) => r.id));

  let inserted = 0;
  await sql.begin(async (tx) => {
    for (const f of foods) {
      const gid = groupId.get(f.groupSlug);
      if (!gid) {
        console.warn(`• supplement: unknown group '${f.groupSlug}' (${f.sourceCode}) — skipped.`);
        continue;
      }
      const id = crypto.randomUUID();
      const rows = await tx`
        insert into food (
          id, code, description, search_text, group_id, type, source,
          energy_kcal, protein, carbohydrate, fat, fiber, sodium, needs_review
        ) values (
          ${id}, ${f.sourceCode}, ${f.description}, unaccent(lower(${f.description})),
          ${gid}, ${f.type}, ${f.source},
          ${f.energyKcal}, ${f.protein}, ${f.carbohydrate}, ${f.fat},
          ${f.fiber}, ${f.sodium}, ${f.needsReview ?? false}
        )
        on conflict (code) do nothing
        returning id`;
      if (rows.length === 0) continue; // already present — leave it untouched
      inserted++;
      const nrows = (f.nutrients ?? [])
        .filter(([nutrient_id]) => validNutrient.has(nutrient_id))
        .map(([nutrient_id, value, is_trace]) => ({
          food_id: id,
          nutrient_id,
          value,
          is_trace,
        }));
      if (nrows.length > 0) await tx`insert into food_nutrient ${tx(nrows)}`;
    }
  });

  console.log(
    `✓ Supplement seeded: ${inserted} new foods (of ${foods.length}).`,
  );
}

/**
 * Loads the base substitution rules (`drizzle/data/taco-substitutions.json`,
 * produced by scripts/build-substitutions.mjs): directed swaps where `grams` of
 * the substitute ≡ 100 g of the main food, stamped `clinic_id = NULL` (shared).
 * Foods are referenced by their exact catalog `description`, resolved to ids
 * here — so it runs after the catalog + supplement are seeded. A rule whose food
 * or substitute isn't in the catalog is skipped rather than failing the seed.
 * Idempotent: skips once any base substitution exists.
 */
async function seedSubstitutions(sql) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(SUBSTITUTIONS, "utf8"));
  } catch {
    console.log(`• No substitutions at ${SUBSTITUTIONS} — skipping.`);
    return;
  }
  const rules = doc.substitutions ?? [];
  if (rules.length === 0) return;

  const [{ count }] = await sql`
    select count(*)::int as count from food_substitution where clinic_id is null`;
  if (count > 0) {
    console.log(`✓ Base substitutions already seeded (${count}) — skipping.`);
    return;
  }

  // Resolve foods by their exact description (unique in the catalog).
  const foodRows = await sql`select id, description from food`;
  const idByDescription = new Map();
  for (const r of foodRows) {
    if (!idByDescription.has(r.description)) idByDescription.set(r.description, r.id);
  }

  const rows = [];
  let skipped = 0;
  for (const r of rules) {
    const foodId = idByDescription.get(r.food);
    const substituteId = idByDescription.get(r.substitute);
    if (!foodId || !substituteId || foodId === substituteId) {
      skipped++;
      continue;
    }
    rows.push({
      clinic_id: null,
      food_id: foodId,
      substitute_food_id: substituteId,
      grams: r.grams,
    });
  }

  if (rows.length > 0) {
    await sql.begin(async (tx) => {
      for (let i = 0; i < rows.length; i += 500) {
        await tx`insert into food_substitution ${tx(rows.slice(i, i + 500))}`;
      }
    });
  }
  console.log(
    `✓ Base substitutions seeded: ${rows.length}${skipped ? ` (${skipped} skipped — food not in catalog)` : ""}.`,
  );
}

/**
 * Loads the curated base household measures (`drizzle/data/food-measures.json`):
 * named portions (e.g. "unidade" = 50 g) stamped `clinic_id = NULL` (shared).
 * Foods are referenced by their exact catalog `description`, resolved to ids
 * here — so it runs after the catalog + supplement are seeded. A measure whose
 * food isn't in the catalog is skipped rather than failing the seed. Idempotent:
 * skips once any base measure exists.
 */
async function seedMeasures(sql) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(MEASURES, "utf8"));
  } catch {
    console.log(`• No measures at ${MEASURES} — skipping.`);
    return;
  }
  const measures = doc.measures ?? [];
  if (measures.length === 0) return;

  const [{ count }] = await sql`
    select count(*)::int as count from food_measure where clinic_id is null`;
  if (count > 0) {
    console.log(`✓ Base measures already seeded (${count}) — skipping.`);
    return;
  }

  const foodRows = await sql`select id, description from food`;
  const idByDescription = new Map();
  for (const r of foodRows) {
    if (!idByDescription.has(r.description)) idByDescription.set(r.description, r.id);
  }

  const rows = [];
  let skipped = 0;
  for (const m of measures) {
    const foodId = idByDescription.get(m.food);
    if (!foodId || !(m.grams > 0) || !m.label) {
      skipped++;
      continue;
    }
    rows.push({
      clinic_id: null,
      food_id: foodId,
      label: m.label,
      grams: m.grams,
      is_default: m.isDefault ?? false,
    });
  }

  if (rows.length > 0) {
    await sql.begin(async (tx) => {
      for (let i = 0; i < rows.length; i += 500) {
        await tx`insert into food_measure ${tx(rows.slice(i, i + 500))}`;
      }
    });
  }
  console.log(
    `✓ Base measures seeded: ${rows.length}${skipped ? ` (${skipped} skipped — food not in catalog)` : ""}.`,
  );
}

/**
 * Loads the base exercise catalog (`drizzle/data/exercises-catalog.ndjson.gz`,
 * produced by scripts/transform-exercises.mjs) into the empty `exercise` table.
 * Each row becomes a shared base exercise (`clinic_id = NULL`), with the muscle /
 * instruction / image arrays stored as-is and `search_text` computed with
 * `unaccent(lower(name))` so the trigram search is accent-blind — the same
 * convention the food catalog uses. Idempotent: skips when `exercise` already
 * has rows, so it's safe on every deploy.
 */
async function seedExercises(sql) {
  const [{ count }] = await sql`select count(*)::int as count from exercise`;
  if (count > 0) {
    console.log(`✓ Exercise catalog already seeded (${count} exercises) — skipping.`);
    return;
  }

  let text;
  try {
    text = gunzipSync(readFileSync(EXERCISES)).toString("utf8");
  } catch {
    console.log(`• No exercise artifact at ${EXERCISES} — skipping exercise seed.`);
    return;
  }

  const exercises = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));

  await sql.begin(async (tx) => {
    for (const e of exercises) {
      await tx`
        insert into exercise (
          id, code, name, search_text, category, level, force, mechanic,
          equipment, primary_muscles, secondary_muscles, instructions, images, source
        ) values (
          ${crypto.randomUUID()}, ${e.code}, ${e.name}, unaccent(lower(${e.name})),
          ${e.category}, ${e.level}, ${e.force}, ${e.mechanic}, ${e.equipment},
          ${e.primaryMuscles}, ${e.secondaryMuscles}, ${e.instructions}, ${e.images},
          'free-exercise-db'
        )`;
    }
  });

  console.log(`✓ Exercise catalog seeded: ${exercises.length} exercises.`);
}

/**
 * Loads the base exercise substitutions (`drizzle/data/exercise-substitutions.json`,
 * produced by scripts/build-exercise-substitutions.mjs): directed "B can replace
 * A" links stamped `clinic_id = NULL` (shared). Exercises are referenced by their
 * stable `code` (the source id), resolved to ids here — so it runs after the
 * exercise catalog is seeded. A link whose exercise or substitute isn't in the
 * catalog is skipped. Idempotent: skips once any base substitution exists.
 */
async function seedExerciseSubstitutions(sql) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(EXERCISE_SUBS, "utf8"));
  } catch {
    console.log(`• No exercise substitutions at ${EXERCISE_SUBS} — skipping.`);
    return;
  }
  const rules = doc.substitutions ?? [];
  if (rules.length === 0) return;

  const [{ count }] = await sql`
    select count(*)::int as count from exercise_substitution where clinic_id is null`;
  if (count > 0) {
    console.log(`✓ Base exercise substitutions already seeded (${count}) — skipping.`);
    return;
  }

  const codeRows = await sql`select id, code from exercise where code is not null`;
  const idByCode = new Map(codeRows.map((r) => [r.code, r.id]));

  const rows = [];
  let skipped = 0;
  for (const rule of rules) {
    const exerciseId = idByCode.get(rule.exercise);
    if (!exerciseId) {
      skipped++;
      continue;
    }
    for (const subCode of rule.substitutes ?? []) {
      const substituteId = idByCode.get(subCode);
      if (!substituteId || substituteId === exerciseId) {
        skipped++;
        continue;
      }
      rows.push({
        clinic_id: null,
        exercise_id: exerciseId,
        substitute_exercise_id: substituteId,
      });
    }
  }

  if (rows.length > 0) {
    await sql.begin(async (tx) => {
      for (let i = 0; i < rows.length; i += 500) {
        await tx`insert into exercise_substitution ${tx(rows.slice(i, i + 500))}`;
      }
    });
  }
  console.log(
    `✓ Base exercise substitutions seeded: ${rows.length}${skipped ? ` (${skipped} skipped)` : ""}.`,
  );
}

/**
 * Loads the app-wide base WhatsApp templates (`drizzle/data/whatsapp-templates.json`)
 * as rows stamped `clinic_id = NULL` and `status = 'approved'`. These are the
 * catalog the coach composer and every message automation resolve against
 * (`resolveTemplate`, clinic-then-base) — so without them, on a production DB
 * that never runs the dev seed, no automated WhatsApp message can be built.
 * Independent of the food/exercise catalog. Idempotent: skips once any base
 * template exists, so it's safe on every deploy.
 */
async function seedWhatsappTemplates(sql) {
  let templates;
  try {
    templates = JSON.parse(readFileSync(WHATSAPP_TEMPLATES, "utf8"));
  } catch {
    console.log(`• No WhatsApp templates at ${WHATSAPP_TEMPLATES} — skipping.`);
    return;
  }
  if (!Array.isArray(templates) || templates.length === 0) return;

  // Top up only the MISSING base keys — never touch existing rows (a clinic may
  // have edited the shared bodies, and we must not clobber them). This makes
  // adding a new base template a simple deploy: it inserts on the next run even
  // though other base rows already exist.
  const existing = await sql`
    select key from whatsapp_template where clinic_id is null`;
  const have = new Set(existing.map((r) => r.key));
  const missing = templates.filter((t) => !have.has(t.key));
  if (missing.length === 0) {
    console.log(`✓ Base WhatsApp templates already up to date (${have.size}).`);
    return;
  }

  const rows = missing.map((t) => ({
    clinic_id: null,
    key: t.key,
    title: t.title,
    body: t.body,
    status: "approved",
  }));
  await sql`insert into whatsapp_template ${sql(rows)}`;
  console.log(
    `✓ Base WhatsApp templates: ${rows.length} new (${have.size} already present).`,
  );
}

const sql = postgres(url, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("✓ Migrations applied.");
  await seedCatalog(sql);
  await seedSupplement(sql);
  await seedSubstitutions(sql);
  await seedMeasures(sql);
  await seedExercises(sql);
  await seedExerciseSubstitutions(sql);
  await seedWhatsappTemplates(sql);
  // Push the exercise images to R2 (idempotent; skips when R2 isn't configured
  // or already uploaded). Non-fatal: a failed upload must not fail the deploy —
  // the app falls back to the source CDN for images.
  try {
    await uploadExerciseImages();
  } catch (error) {
    console.warn("• Exercise image upload failed (continuing):", error?.message ?? error);
  }
} catch (error) {
  console.error("✗ Migration failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
