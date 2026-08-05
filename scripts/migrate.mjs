// Applies the Drizzle SQL migrations in ./drizzle to DATABASE_URL, then seeds
// the base food catalog, then exits. Uses drizzle-orm's programmatic migrator
// (no drizzle-kit needed at runtime). Idempotent: already-applied migrations
// are tracked and skipped, and the catalog seed no-ops once `food` is populated.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const CATALOG = "./drizzle/data/food-catalog.ndjson.gz";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — cannot run migrations.");
  process.exit(1);
}

/**
 * Loads the base TBCA catalog (`drizzle/data/food-catalog.ndjson.gz`, produced
 * by scripts/transform-catalog.mjs) into the empty catalog tables. Idempotent:
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
          ${groupId.get(f.groupSlug)}, ${f.type}, 'TBCA',
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

const sql = postgres(url, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("✓ Migrations applied.");
  await seedCatalog(sql);
} catch (error) {
  console.error("✗ Migration failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
