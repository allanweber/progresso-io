import { and, asc, count, desc, eq, isNull, or, sql } from "drizzle-orm";

import { schema } from "@/db";
import type {
  Exercise,
  ExerciseCategory,
  ExerciseEquipment,
  ExerciseLevel,
  Muscle,
} from "@/db/schema";
import type { TenantContext } from "@/server/tenant";

/**
 * Exercise-catalog DAL. Like the food catalog, the exercise catalog is
 * reference data: an `exercise` row with `clinicId = null` is the shared open
 * base (free-exercise-db + PT-BR translation), a row with `clinicId` set is a
 * clinic's own custom exercise (a later phase). Every read here is scoped to
 * `clinicId IS NULL OR clinicId = ctx.clinicId`, so a clinic sees the base plus
 * only its own — never another clinic's.
 */

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

/** Whether an exercise is from the shared base catalog or the clinic's own. */
export type ExerciseOrigin = "base" | "clinic";

/** A row in the exercise listing (identity + the facets the cards show). */
export type ExerciseListItem = {
  id: string;
  code: string | null;
  name: string;
  category: ExerciseCategory;
  level: ExerciseLevel;
  equipment: ExerciseEquipment | null;
  primaryMuscles: Muscle[];
  origin: ExerciseOrigin;
  /** First image key ("<code>/0.jpg"), for the card thumbnail. */
  thumbnail: string | null;
};

export type ExerciseListParams = {
  search?: string;
  category?: ExerciseCategory;
  level?: ExerciseLevel;
  equipment?: ExerciseEquipment;
  /** Restrict to exercises that target this muscle (primary or secondary). */
  muscle?: Muscle;
  page?: number;
  pageSize?: number;
};

export type ExerciseListResult = {
  items: ExerciseListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** Builds the shared WHERE for a listing: tenant scope + not archived + filters. */
function listWhere(ctx: TenantContext, params: ExerciseListParams) {
  const conds = [
    or(
      isNull(schema.exercise.clinicId),
      eq(schema.exercise.clinicId, ctx.clinicId),
    ),
    eq(schema.exercise.archived, false),
  ];
  if (params.category) conds.push(eq(schema.exercise.category, params.category));
  if (params.level) conds.push(eq(schema.exercise.level, params.level));
  if (params.equipment) {
    conds.push(eq(schema.exercise.equipment, params.equipment));
  }
  if (params.muscle) {
    // The muscle may be primary or secondary — match either array.
    conds.push(
      sql`(${params.muscle} = any(${schema.exercise.primaryMuscles})
        or ${params.muscle} = any(${schema.exercise.secondaryMuscles}))`,
    );
  }
  const term = params.search?.trim();
  if (term) {
    // Each whitespace token must appear in the (already unaccented) search_text,
    // matching how it was built at seed time — so accents and case don't matter;
    // the GIN trigram index accelerates it.
    for (const token of term.split(/\s+/)) {
      conds.push(
        sql`${schema.exercise.searchText} like '%' || unaccent(lower(${token})) || '%'`,
      );
    }
  }
  return and(...conds);
}

/**
 * A page of the catalog visible to this clinic (base + own custom), excluding
 * archived exercises. When `search` is set, results are ranked by trigram
 * similarity; otherwise alphabetically by name.
 */
export async function listExercises(
  ctx: TenantContext,
  params: ExerciseListParams = {},
): Promise<ExerciseListResult> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(params.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const where = listWhere(ctx, params);
  const term = params.search?.trim();

  const orderBy = term
    ? [
        desc(sql`similarity(${schema.exercise.searchText}, unaccent(lower(${term})))`),
        asc(schema.exercise.name),
      ]
    : [asc(schema.exercise.name), asc(schema.exercise.id)];

  const rows = await ctx.db
    .select({
      id: schema.exercise.id,
      code: schema.exercise.code,
      name: schema.exercise.name,
      category: schema.exercise.category,
      level: schema.exercise.level,
      equipment: schema.exercise.equipment,
      primaryMuscles: schema.exercise.primaryMuscles,
      images: schema.exercise.images,
      clinicId: schema.exercise.clinicId,
    })
    .from(schema.exercise)
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await ctx.db
    .select({ total: count() })
    .from(schema.exercise)
    .where(where);

  const items: ExerciseListItem[] = rows.map(({ clinicId, images, ...r }) => ({
    ...r,
    origin: clinicId === null ? "base" : "clinic",
    thumbnail: images[0] ?? null,
  }));

  return { items, total, page, pageSize };
}

export type ExerciseDetail = Exercise & { origin: ExerciseOrigin };

/**
 * A single exercise, visible to this clinic (a base exercise or one of its own).
 * Returns null when the id is neither — so another clinic's custom exercise is
 * never leaked.
 */
export async function getExercise(
  ctx: TenantContext,
  id: string,
): Promise<ExerciseDetail | null> {
  const [row] = await ctx.db
    .select()
    .from(schema.exercise)
    .where(
      and(
        eq(schema.exercise.id, id),
        or(
          isNull(schema.exercise.clinicId),
          eq(schema.exercise.clinicId, ctx.clinicId),
        ),
      ),
    );
  if (!row) return null;
  return { ...row, origin: row.clinicId === null ? "base" : "clinic" };
}
