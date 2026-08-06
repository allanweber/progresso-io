// Applies the Drizzle SQL migrations in ./drizzle to DATABASE_URL, then seeds
// the base food catalog, then exits. Uses drizzle-orm's programmatic migrator
// (no drizzle-kit needed at runtime). Idempotent: already-applied migrations
// are tracked and skipped, and the catalog seed no-ops once `food` is populated.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const CATALOG = "./drizzle/data/taco-catalog.ndjson.gz";
const SUPPLEMENT = "./drizzle/data/taco-supplement.json";

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

const sql = postgres(url, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("✓ Migrations applied.");
  await seedCatalog(sql);
  await seedSupplement(sql);
} catch (error) {
  console.error("✗ Migration failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
