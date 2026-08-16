import { createHash } from "node:crypto";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { schema } from "@/db";
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from "@/lib/exercises";
import type { TenantContext } from "@/server/tenant";

/**
 * The catalog block: the **cacheable prompt prefix**.
 *
 * This is the single most consequential piece of the generator, and its whole
 * value comes from being byte-identical on every call. Three things must stay
 * stable — the **order**, the **set**, and the **serialization** — and all three
 * fail *silently*: a shuffled prefix produces no error, just a cold cache, a
 * slower request and a bigger bill. Hence `catalogHash` on every audit row.
 *
 * Design decisions this file encodes (see `docs/ai-generator.md`):
 *
 * - **Platform base rows only** (`clinicId IS NULL`). One global prefix shared
 *   by every clinic, so the cache hits ~100% after the first call — a per-clinic
 *   or per-aluno catalog would differ every time and hit ~0%. It also makes it
 *   structurally impossible for one clinic's custom exercise to appear in
 *   another clinic's prompt. Clinic-specific customization is the coach's manual
 *   job after generation.
 * - **Integer indices, not UUIDs.** A UUID costs ~12–18 tokens and the block is
 *   mostly ids; a short index costs one or two. An out-of-range index is also
 *   caught instantly, where a well-formed-but-wrong UUID needs a lookup.
 * - **Split per kind.** Workout generation never sees foods and vice versa: two
 *   stable prefixes, each about half the size, and a shorter prompt the model
 *   attends to better.
 */

/** How the model's answer maps back to real rows. */
export type CatalogBlock = {
  /** The rendered text, verbatim, for the system prompt. */
  text: string;
  /** 1-based index → row uuid. The only way an index becomes an id. */
  byIndex: Map<number, string>;
  /** sha256 of `text`, recorded per generation for cache observability. */
  hash: string;
  /** How many rows the block carries — logged, and useful in tests. */
  size: number;
};

/** Hash + index map for a rendered block. */
function finish(lines: string[], ids: string[]): CatalogBlock {
  const text = lines.join("\n");
  const byIndex = new Map<number, string>();
  ids.forEach((id, i) => byIndex.set(i + 1, id));
  return {
    text,
    byIndex,
    hash: createHash("sha256").update(text).digest("hex").slice(0, 16),
    size: ids.length,
  };
}

/**
 * Stable ordering for both catalogs.
 *
 * `code` is UNIQUE and populated for seeded base rows, and — unlike the random
 * `id` — comes from the source data, so the same catalog serializes identically
 * in dev, CI and production. The `id` tiebreaker covers base rows an admin
 * created without a code, which would otherwise tie and order arbitrarily.
 *
 * **Never remove either term.** Postgres gives no row-order guarantee without an
 * ORDER BY, and a partial one is just a rarer version of the same bug.
 */
const stableOrder = <T extends { code: unknown; id: unknown }>(t: T) =>
  [sql`${t.code} asc nulls last`, asc(t.id as never)] as const;

/**
 * Every base exercise, as `index: name (muscles, equipment)`.
 *
 * No filtering beyond archived: the model sees the whole platform catalog and
 * the coach edits the draft afterwards.
 */
export async function buildExerciseCatalog(
  ctx: TenantContext,
): Promise<CatalogBlock> {
  const rows = await ctx.db
    .select({
      id: schema.exercise.id,
      code: schema.exercise.code,
      name: schema.exercise.name,
      primaryMuscles: schema.exercise.primaryMuscles,
      equipment: schema.exercise.equipment,
    })
    .from(schema.exercise)
    .where(
      and(
        isNull(schema.exercise.clinicId),
        eq(schema.exercise.archived, false),
      ),
    )
    .orderBy(...stableOrder(schema.exercise));

  const lines = rows.map((r, i) => {
    const muscles = r.primaryMuscles
      .map((m) => MUSCLE_LABELS[m] ?? m)
      .join("/");
    const equip = r.equipment ? EQUIPMENT_LABELS[r.equipment] : "livre";
    return `${i + 1}: ${r.name} (${muscles || "geral"}, ${equip})`;
  });
  return finish(lines, rows.map((r) => r.id));
}

/**
 * Every usable base food, as `index: description — Nkcal PXg CYg GZg /100g`.
 *
 * Two rows are dropped, and both are correctness filters rather than
 * optimizations — they produce one fixed list identical for every clinic, so the
 * cache is unaffected:
 *
 * - **Any null macro.** TACO has genuinely unmeasured cells; a diet item with an
 *   unknown kcal value is worse than no item.
 * - **`needsReview`.** The ~24 duplicate descriptions. Asking a model to choose
 *   between two identically-named rows invites the wrong choice.
 */
export async function buildFoodCatalog(
  ctx: TenantContext,
): Promise<CatalogBlock> {
  const rows = await ctx.db
    .select({
      id: schema.food.id,
      code: schema.food.code,
      description: schema.food.description,
      energyKcal: schema.food.energyKcal,
      protein: schema.food.protein,
      carbohydrate: schema.food.carbohydrate,
      fat: schema.food.fat,
    })
    .from(schema.food)
    .where(
      and(
        isNull(schema.food.clinicId),
        eq(schema.food.archived, false),
        eq(schema.food.needsReview, false),
        isNotNull(schema.food.energyKcal),
        isNotNull(schema.food.protein),
        isNotNull(schema.food.carbohydrate),
        isNotNull(schema.food.fat),
      ),
    )
    .orderBy(...stableOrder(schema.food));

  // One decimal everywhere: enough precision for a diet, and a fixed width so
  // a float that round-trips differently can't shift the bytes.
  const n = (v: number | null) => (v ?? 0).toFixed(1);
  const lines = rows.map(
    (r, i) =>
      `${i + 1}: ${r.description} — ${n(r.energyKcal)}kcal ` +
      `P${n(r.protein)} C${n(r.carbohydrate)} G${n(r.fat)} /100g`,
  );
  return finish(lines, rows.map((r) => r.id));
}

/**
 * Maps the model's indices back to row ids, reporting any that don't exist.
 *
 * An out-of-range index is the hallucination signal: the caller retries once,
 * free, and fails the generation if the second answer is also invalid. Never
 * fuzzy-match a name instead — "arroz integral cozido" and "cru" differ by ~3×
 * in kcal, and a fuzzy match that picks wrong is worse than an error.
 */
export function resolveIndices(
  block: CatalogBlock,
  indices: number[],
): { ok: true; ids: Map<number, string> } | { ok: false; invalid: number[] } {
  const ids = new Map<number, string>();
  const invalid: number[] = [];
  for (const index of indices) {
    const id = block.byIndex.get(index);
    if (id === undefined) invalid.push(index);
    else ids.set(index, id);
  }
  return invalid.length > 0 ? { ok: false, invalid } : { ok: true, ids };
}
