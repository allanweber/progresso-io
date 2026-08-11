import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sql } from "drizzle-orm";

import * as schema from "@/db/schema";
import type { TestDb } from "./pglite";

/**
 * Loads the real base catalog (all TACO foods + all free-exercise-db exercises)
 * from the seed artifacts into a test database, so the starter resolver runs
 * against the same data production does. Used by the starter integration tests.
 */

function readNdjsonGz(relPath: string): Record<string, unknown>[] {
  const buf = gunzipSync(readFileSync(join(process.cwd(), relPath)));
  return buf
    .toString("utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

async function chunkedInsert<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
  size = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await insert(rows.slice(i, i + size));
  }
}

/** Inserts every base food + exercise from the artifacts. Idempotent-free (call once). */
export async function loadBaseCatalog(db: TestDb): Promise<void> {
  const foodLines = readNdjsonGz("drizzle/data/taco-catalog.ndjson.gz");

  // The first line is metadata carrying the canonical food groups (migrations
  // create the table but don't seed rows).
  const meta = foodLines.find((r) => Array.isArray(r.groups));
  const groupDefs = (meta?.groups as { name: string; slug: string }[]) ?? [];
  if (groupDefs.length) {
    await db.insert(schema.foodGroup).values(groupDefs);
  }
  const groups = await db
    .select({ id: schema.foodGroup.id, slug: schema.foodGroup.slug })
    .from(schema.foodGroup);
  const groupBySlug = new Map(groups.map((g) => [g.slug, g.id]));
  const fallbackGroup = groups[0]?.id;

  const foodRows = foodLines
    .filter((r) => typeof r.description === "string") // skip the metadata line
    .map((r) => ({
      code: (r.code as string) ?? null,
      description: r.description as string,
      searchText: sql`unaccent(lower(${r.description as string}))`,
      groupId: groupBySlug.get(r.groupSlug as string) ?? fallbackGroup!,
      type: (r.type as "ingrediente" | "preparacao") ?? "ingrediente",
      clinicId: null,
      energyKcal: (r.energyKcal as number) ?? null,
      protein: (r.protein as number) ?? null,
      carbohydrate: (r.carbohydrate as number) ?? null,
      fat: (r.fat as number) ?? null,
      fiber: (r.fiber as number) ?? null,
      sodium: (r.sodium as number) ?? null,
    }));

  // Supplement foods (whey, pea protein, textured soy) live in a JSON file.
  const supplement = JSON.parse(
    readFileSync(join(process.cwd(), "drizzle/data/taco-supplement.json"), "utf8"),
  ) as { foods: Record<string, unknown>[] };
  for (const r of supplement.foods) {
    const description = (r.description ?? r.name) as string;
    if (!description) continue;
    foodRows.push({
      code: (r.code as string) ?? null,
      description,
      searchText: sql`unaccent(lower(${description}))`,
      groupId: groupBySlug.get(r.groupSlug as string) ?? fallbackGroup!,
      type: (r.type as "ingrediente" | "preparacao") ?? "ingrediente",
      clinicId: null,
      energyKcal: (r.energyKcal as number) ?? null,
      protein: (r.protein as number) ?? null,
      carbohydrate: (r.carbohydrate as number) ?? null,
      fat: (r.fat as number) ?? null,
      fiber: (r.fiber as number) ?? null,
      sodium: (r.sodium as number) ?? null,
    });
  }

  await chunkedInsert(foodRows, (chunk) =>
    db.insert(schema.food).values(chunk),
  );

  const exRows = readNdjsonGz("drizzle/data/exercises-catalog.ndjson.gz").map(
    (r) => ({
      code: (r.code as string) ?? null,
      name: r.name as string,
      searchText: sql`unaccent(lower(${r.name as string}))`,
      category: r.category as string,
      level: r.level as string,
      force: (r.force as string | null) ?? null,
      mechanic: (r.mechanic as string | null) ?? null,
      equipment: (r.equipment as string | null) ?? null,
      primaryMuscles: (r.primaryMuscles as string[]) ?? [],
      secondaryMuscles: (r.secondaryMuscles as string[]) ?? [],
      instructions: (r.instructions as string[]) ?? [],
      images: (r.images as string[]) ?? [],
      clinicId: null,
    }),
  );

  await chunkedInsert(exRows, (chunk) =>
    // The gz rows carry string enum values the columns accept at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.insert(schema.exercise).values(chunk as any),
  );
}
