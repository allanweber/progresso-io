import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { AnamnesisModality, AnamnesisObjective } from "@/lib/anamneses";
import { STARTER_ANAMNESES } from "@/server/anamneses/starter-templates";
import type {
  Exercise,
  ExerciseCategory,
  ExerciseEquipment,
  ExerciseLevel,
  Food,
  FoodType,
  Muscle,
  Student,
} from "@/db/schema";
import type {
  ExerciseSubstituteRow,
  ExerciseWriteInput,
} from "@/server/dal/exercises";
import type {
  FoodMeasureRow,
  FoodNutrientRow,
  FoodSubstituteRow,
} from "@/server/dal/foods";

/**
 * Platform-admin DAL — the one deliberate exception to the tenant-scoping rule.
 *
 * Every other DAL module takes a {@link import("@/server/tenant").TenantContext}
 * and scopes each query by `clinicId`. A platform admin (`role = "admin"`) works
 * ACROSS clinics and belongs to none, so these functions take a raw {@link DB}
 * handle and are intentionally NOT clinic-scoped. That power is gated at the
 * route layer: every caller MUST pass `getAdminSession()` first (see
 * `src/server/admin.ts`), so nothing here is reachable by a coach or aluno.
 */

export type AdminStudentFilters = {
  clinicId?: string;
  /** Case-insensitive substring match on the student's e-mail. */
  email?: string;
};

/** A student plus its clinic name and portal-access flag, for the admin table. */
export type AdminStudentRow = Student & {
  clinicName: string;
  hasAccount: boolean;
};

/** All clinics (id + name) for the admin's clinic filter. */
export async function listClinics(
  db: DB,
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: schema.clinic.id, name: schema.clinic.name })
    .from(schema.clinic)
    .orderBy(schema.clinic.name);
}

/**
 * Every student on the platform (optionally filtered by clinic and/or e-mail),
 * ordered by clinic then newest-first. Cross-tenant by design — admin only.
 */
export async function listAllStudents(
  db: DB,
  filters: AdminStudentFilters = {},
): Promise<AdminStudentRow[]> {
  const conditions: SQL[] = [];
  if (filters.clinicId) {
    conditions.push(eq(schema.students.clinicId, filters.clinicId));
  }
  if (filters.email) {
    conditions.push(ilike(schema.students.email, `%${filters.email}%`));
  }

  const rows = await db
    .select({ student: schema.students, clinicName: schema.clinic.name })
    .from(schema.students)
    .innerJoin(schema.clinic, eq(schema.students.clinicId, schema.clinic.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(schema.clinic.name, desc(schema.students.createdAt));

  return rows.map((r) => ({
    ...r.student,
    clinicName: r.clinicName,
    hasAccount: r.student.userId !== null,
  }));
}

/**
 * Hard-deletes a student and everything tied to it — the destructive
 * counterpart to a coach's soft `archiveStudent`, reserved for platform admins.
 *
 * Runs in one transaction and clears the student from EVERY table it touches:
 * - `students` — the row itself.
 * - `invitation` — cascades from the student row (FK `onDelete: cascade`).
 * - `user` — the aluno's login, if they activated one; deleting it cascades
 *   their `session` and `account` rows (both FK `onDelete: cascade`).
 *
 * Returns `deleted: false` when the id doesn't exist. `deletedUser` reports
 * whether a linked login was removed too.
 */
export async function hardDeleteStudent(
  db: DB,
  studentId: string,
): Promise<{ deleted: boolean; deletedUser: boolean }> {
  return db.transaction(async (tx) => {
    const [student] = await tx
      .select()
      .from(schema.students)
      .where(eq(schema.students.id, studentId));
    if (!student) return { deleted: false, deletedUser: false };

    // The student row first — its invitations cascade away with it.
    await tx.delete(schema.students).where(eq(schema.students.id, studentId));

    // Then the aluno's login, if any — sessions and accounts cascade from it.
    let deletedUser = false;
    if (student.userId) {
      await tx.delete(schema.user).where(eq(schema.user.id, student.userId));
      deletedUser = true;
    }

    return { deleted: true, deletedUser };
  });
}

/* -------------------------------------------------------------------------- */
/*  Food catalog — platform admin (phase 3)                                    */
/*                                                                            */
/*  Cross-tenant by design and admin-only (gated by getAdminSession at the     */
/*  route). The admin sees EVERY food — the shared base (`clinic_id IS NULL`)   */
/*  and every clinic's custom foods — but only ever WRITES the base: creates,   */
/*  edits and archives touch `clinic_id IS NULL` rows exclusively, and base     */
/*  substitutions are stamped `clinic_id = NULL`. A clinic's own food/rule is   */
/*  never mutated here (read-only cross-clinic view).                          */
/* -------------------------------------------------------------------------- */

const FOOD_SORTABLE = {
  description: schema.food.description,
  energyKcal: schema.food.energyKcal,
  protein: schema.food.protein,
  carbohydrate: schema.food.carbohydrate,
  fat: schema.food.fat,
  fiber: schema.food.fiber,
} as const;
export type AdminFoodSort = keyof typeof FOOD_SORTABLE;

export type AdminFoodOrigin = "base" | "clinic";

/** A row in the admin's cross-clinic food listing (per 100 g; hot macros). */
export type AdminFoodListItem = {
  id: string;
  code: string | null;
  description: string;
  type: FoodType;
  groupName: string;
  groupSlug: string;
  origin: AdminFoodOrigin;
  clinicName: string | null;
  archived: boolean;
  /** Number of shared base substitutions (`clinic_id NULL`) for this food. */
  substituteCount: number;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
};

export type AdminFoodListParams = {
  search?: string;
  groupSlug?: string;
  type?: FoodType;
  /** base = shared catalog; clinic = any clinic's own. */
  origin?: AdminFoodOrigin;
  /** Restrict to one clinic's custom foods. */
  clinicId?: string;
  /** Include archived foods (default false). */
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
  sort?: AdminFoodSort;
  dir?: "asc" | "desc";
};

export type AdminFoodListResult = {
  items: AdminFoodListItem[];
  total: number;
  page: number;
  pageSize: number;
};

const A_DEFAULT_PAGE_SIZE = 25;
const A_MAX_PAGE_SIZE = 100;

/** Shared WHERE for the admin listing: filters, no tenant scope (admin sees all). */
function adminFoodWhere(params: AdminFoodListParams) {
  const conds: SQL[] = [];
  if (!params.includeArchived) conds.push(eq(schema.food.archived, false));
  if (params.groupSlug) conds.push(eq(schema.foodGroup.slug, params.groupSlug));
  if (params.type) conds.push(eq(schema.food.type, params.type));
  if (params.origin === "base") conds.push(isNull(schema.food.clinicId));
  if (params.origin === "clinic") conds.push(isNotNull(schema.food.clinicId));
  if (params.clinicId) conds.push(eq(schema.food.clinicId, params.clinicId));
  const term = params.search?.trim();
  if (term) {
    for (const token of term.split(/\s+/)) {
      conds.push(
        sql`${schema.food.searchText} like '%' || unaccent(lower(${token})) || '%'`,
      );
    }
  }
  return conds.length ? and(...conds) : undefined;
}

/**
 * Every food on the platform (base + all clinics), filtered and paginated.
 * Cross-tenant by design — admin only. Each clinic food carries its clinic name.
 */
export async function listAllFoods(
  db: DB,
  params: AdminFoodListParams = {},
): Promise<AdminFoodListResult> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(
    A_MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(params.pageSize ?? A_DEFAULT_PAGE_SIZE)),
  );
  const where = adminFoodWhere(params);
  const term = params.search?.trim();

  const orderBy = term
    ? [
        desc(sql`similarity(${schema.food.searchText}, unaccent(lower(${term})))`),
        asc(schema.food.description),
      ]
    : [
        (params.dir === "desc" ? desc : asc)(
          FOOD_SORTABLE[params.sort ?? "description"],
        ),
        asc(schema.food.id),
      ];

  const rows = await db
    .select({
      id: schema.food.id,
      code: schema.food.code,
      description: schema.food.description,
      type: schema.food.type,
      clinicId: schema.food.clinicId,
      clinicName: schema.clinic.name,
      archived: schema.food.archived,
      groupName: schema.foodGroup.name,
      groupSlug: schema.foodGroup.slug,
      // Shared base substitutions attached to this food (the admin-managed ones).
      substituteCount: sql<number>`(
        select count(*)::int from food_substitution fs
        where fs.food_id = ${schema.food.id} and fs.clinic_id is null
      )`,
      energyKcal: schema.food.energyKcal,
      protein: schema.food.protein,
      carbohydrate: schema.food.carbohydrate,
      fat: schema.food.fat,
      fiber: schema.food.fiber,
      sodium: schema.food.sodium,
    })
    .from(schema.food)
    .innerJoin(schema.foodGroup, eq(schema.food.groupId, schema.foodGroup.id))
    .leftJoin(schema.clinic, eq(schema.food.clinicId, schema.clinic.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.food)
    .innerJoin(schema.foodGroup, eq(schema.food.groupId, schema.foodGroup.id))
    .where(where);

  const items: AdminFoodListItem[] = rows.map(
    ({ clinicId, clinicName, ...r }) => ({
      ...r,
      origin: clinicId === null ? "base" : "clinic",
      clinicName: clinicId === null ? null : clinicName,
    }),
  );

  return { items, total, page, pageSize };
}

export type AdminFoodDetail = Food & {
  groupName: string;
  groupSlug: string;
  origin: AdminFoodOrigin;
  clinicName: string | null;
  nutrients: FoodNutrientRow[];
  /** Base substitutions (`clinic_id NULL`) for the food — admin-managed. */
  substitutes: FoodSubstituteRow[];
  /** Base measures (`clinic_id NULL`) for the food — admin-managed. */
  measures: FoodMeasureRow[];
};

/**
 * Any single food (base or any clinic's), with group, clinic name, full profile
 * and the food's **base** substitutions (the ones the admin manages). Cross-
 * tenant — admin only. Returns null when the id doesn't exist.
 */
export async function getAnyFood(
  db: DB,
  id: string,
): Promise<AdminFoodDetail | null> {
  const [row] = await db
    .select({
      food: schema.food,
      groupName: schema.foodGroup.name,
      groupSlug: schema.foodGroup.slug,
      clinicName: schema.clinic.name,
    })
    .from(schema.food)
    .innerJoin(schema.foodGroup, eq(schema.food.groupId, schema.foodGroup.id))
    .leftJoin(schema.clinic, eq(schema.food.clinicId, schema.clinic.id))
    .where(eq(schema.food.id, id));
  if (!row) return null;

  const nutrients = await db
    .select({
      id: schema.nutrient.id,
      label: schema.nutrient.label,
      unit: schema.nutrient.unit,
      kind: schema.nutrient.kind,
      value: schema.foodNutrient.value,
      isTrace: schema.foodNutrient.isTrace,
    })
    .from(schema.foodNutrient)
    .innerJoin(
      schema.nutrient,
      eq(schema.foodNutrient.nutrientId, schema.nutrient.id),
    )
    .where(eq(schema.foodNutrient.foodId, id))
    .orderBy(asc(schema.nutrient.sortOrder));

  const substitute = schema.food;
  const subs = await db
    .select({
      id: schema.foodSubstitution.id,
      grams: schema.foodSubstitution.grams,
      foodId: substitute.id,
      description: substitute.description,
      code: substitute.code,
      clinicId: substitute.clinicId,
    })
    .from(schema.foodSubstitution)
    .innerJoin(
      substitute,
      eq(schema.foodSubstitution.substituteFoodId, substitute.id),
    )
    .where(
      and(
        eq(schema.foodSubstitution.foodId, id),
        isNull(schema.foodSubstitution.clinicId),
      ),
    )
    .orderBy(asc(substitute.description));

  // Base measures the admin manages (clinic_id NULL only).
  const measureRows = await db
    .select({
      id: schema.foodMeasure.id,
      label: schema.foodMeasure.label,
      grams: schema.foodMeasure.grams,
      isDefault: schema.foodMeasure.isDefault,
    })
    .from(schema.foodMeasure)
    .where(
      and(
        eq(schema.foodMeasure.foodId, id),
        isNull(schema.foodMeasure.clinicId),
      ),
    )
    .orderBy(desc(schema.foodMeasure.isDefault), asc(schema.foodMeasure.grams));

  return {
    ...row.food,
    groupName: row.groupName,
    groupSlug: row.groupSlug,
    origin: row.food.clinicId === null ? "base" : "clinic",
    clinicName: row.food.clinicId === null ? null : row.clinicName,
    nutrients,
    substitutes: subs.map(({ clinicId, ...s }) => ({
      ...s,
      origin: clinicId === null ? "base" : "clinic",
      removable: true, // every base substitution is admin-removable
    })),
    measures: measureRows.map((m) => ({
      ...m,
      origin: "base" as const,
      removable: true, // every base measure is admin-removable
    })),
  };
}

/** The editable fields of a base food (same "enxuto" shape as the coach form). */
export type BaseFoodInput = {
  description: string;
  groupSlug: string;
  type: FoodType;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
};

async function adminGroupId(db: DB, slug: string): Promise<string | null> {
  const [g] = await db
    .select({ id: schema.foodGroup.id })
    .from(schema.foodGroup)
    .where(eq(schema.foodGroup.slug, slug));
  return g?.id ?? null;
}

async function anyFoodExists(db: DB, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.food.id })
    .from(schema.food)
    .where(eq(schema.food.id, id));
  return Boolean(row);
}

function baseMacros(input: BaseFoodInput) {
  return {
    energyKcal: input.energyKcal,
    protein: input.protein,
    carbohydrate: input.carbohydrate,
    fat: input.fat,
    fiber: input.fiber,
    sodium: input.sodium,
  };
}

/** Creates a shared base food (`clinic_id NULL`, `source = "custom"`). */
export async function createBaseFood(
  db: DB,
  input: BaseFoodInput,
): Promise<Food | null> {
  const groupId = await adminGroupId(db, input.groupSlug);
  if (!groupId) return null;
  const [row] = await db
    .insert(schema.food)
    .values({
      clinicId: null,
      code: null,
      description: input.description,
      searchText: sql`unaccent(lower(${input.description}))`,
      groupId,
      type: input.type,
      source: "custom",
      ...baseMacros(input),
    })
    .returning();
  return row;
}

/**
 * Edits a shared base food. Scoped to `clinic_id IS NULL`, so a clinic's own
 * food is never touched (returns null — a 404 at the route).
 */
export async function updateBaseFood(
  db: DB,
  id: string,
  input: BaseFoodInput,
): Promise<Food | null> {
  const groupId = await adminGroupId(db, input.groupSlug);
  if (!groupId) return null;
  const [row] = await db
    .update(schema.food)
    .set({
      description: input.description,
      searchText: sql`unaccent(lower(${input.description}))`,
      groupId,
      type: input.type,
      ...baseMacros(input),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.food.id, id), isNull(schema.food.clinicId)))
    .returning();
  return row ?? null;
}

/** Archives a shared base food (`clinic_id IS NULL` only). */
export async function archiveBaseFood(
  db: DB,
  id: string,
): Promise<Food | null> {
  const [row] = await db
    .update(schema.food)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(schema.food.id, id), isNull(schema.food.clinicId)))
    .returning();
  return row ?? null;
}

/** Restores (unarchives) a shared base food (`clinic_id IS NULL` only). */
export async function unarchiveBaseFood(
  db: DB,
  id: string,
): Promise<Food | null> {
  const [row] = await db
    .update(schema.food)
    .set({ archived: false, updatedAt: new Date() })
    .where(and(eq(schema.food.id, id), isNull(schema.food.clinicId)))
    .returning();
  return row ?? null;
}

export type AddBaseSubstitutionResult =
  | { ok: true; substitute: FoodSubstituteRow }
  | {
      ok: false;
      reason: "food_not_found" | "substitute_not_found" | "same_food" | "duplicate";
    };

/**
 * Adds a **base** substitution rule (`clinic_id NULL`): `grams` of the
 * substitute replace 100 g of the food. Both foods may be any food on the
 * platform; the rule itself is shared/base.
 */
export async function addBaseSubstitution(
  db: DB,
  foodId: string,
  substituteFoodId: string,
  grams: number,
): Promise<AddBaseSubstitutionResult> {
  if (foodId === substituteFoodId) return { ok: false, reason: "same_food" };
  if (!(await anyFoodExists(db, foodId))) {
    return { ok: false, reason: "food_not_found" };
  }
  if (!(await anyFoodExists(db, substituteFoodId))) {
    return { ok: false, reason: "substitute_not_found" };
  }
  const [dupe] = await db
    .select({ id: schema.foodSubstitution.id })
    .from(schema.foodSubstitution)
    .where(
      and(
        isNull(schema.foodSubstitution.clinicId),
        eq(schema.foodSubstitution.foodId, foodId),
        eq(schema.foodSubstitution.substituteFoodId, substituteFoodId),
      ),
    );
  if (dupe) return { ok: false, reason: "duplicate" };

  const [ins] = await db
    .insert(schema.foodSubstitution)
    .values({ clinicId: null, foodId, substituteFoodId, grams })
    .returning();
  const [sub] = await db
    .select({
      description: schema.food.description,
      code: schema.food.code,
      clinicId: schema.food.clinicId,
    })
    .from(schema.food)
    .where(eq(schema.food.id, substituteFoodId));

  return {
    ok: true,
    substitute: {
      id: ins.id,
      foodId: substituteFoodId,
      description: sub.description,
      code: sub.code,
      grams: ins.grams,
      origin: sub.clinicId === null ? "base" : "clinic",
      removable: true,
    },
  };
}

/**
 * Adds a **base** household measure (`clinic_id NULL`) to any food. Admin-only,
 * cross-tenant. Returns null when the food doesn't exist.
 */
export async function addBaseMeasure(
  db: DB,
  foodId: string,
  input: { label: string; grams: number; isDefault: boolean },
): Promise<FoodMeasureRow | null> {
  if (!(await anyFoodExists(db, foodId))) return null;
  const [ins] = await db
    .insert(schema.foodMeasure)
    .values({
      clinicId: null,
      foodId,
      label: input.label,
      grams: input.grams,
      isDefault: input.isDefault,
    })
    .returning();
  return {
    id: ins.id,
    label: ins.label,
    grams: ins.grams,
    isDefault: ins.isDefault,
    origin: "base",
    removable: true,
  };
}

/** Removes a **base** household measure (`clinic_id NULL` only). */
export async function removeBaseMeasure(
  db: DB,
  foodId: string,
  measureId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(schema.foodMeasure)
    .where(
      and(
        eq(schema.foodMeasure.id, measureId),
        eq(schema.foodMeasure.foodId, foodId),
        isNull(schema.foodMeasure.clinicId),
      ),
    )
    .returning({ id: schema.foodMeasure.id });
  return deleted.length > 0;
}

/** Removes a **base** substitution rule (`clinic_id NULL` only). */
export async function removeBaseSubstitution(
  db: DB,
  foodId: string,
  substitutionId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(schema.foodSubstitution)
    .where(
      and(
        eq(schema.foodSubstitution.id, substitutionId),
        eq(schema.foodSubstitution.foodId, foodId),
        isNull(schema.foodSubstitution.clinicId),
      ),
    )
    .returning({ id: schema.foodSubstitution.id });
  return deleted.length > 0;
}

/** The canonical food groups (for the admin listing/form filters). */
export async function listFoodGroups(
  db: DB,
): Promise<{ name: string; slug: string }[]> {
  return db
    .select({ name: schema.foodGroup.name, slug: schema.foodGroup.slug })
    .from(schema.foodGroup)
    .orderBy(asc(schema.foodGroup.name));
}

/* -------------------------------------------------------------------------- */
/*  Exercise catalog (cross-tenant browse — admin only)                        */
/* -------------------------------------------------------------------------- */

export type AdminExerciseOrigin = "base" | "clinic";

/** A row in the admin's cross-clinic exercise listing. */
export type AdminExerciseListItem = {
  id: string;
  code: string | null;
  name: string;
  category: ExerciseCategory;
  level: ExerciseLevel;
  equipment: ExerciseEquipment | null;
  primaryMuscles: Muscle[];
  origin: AdminExerciseOrigin;
  clinicName: string | null;
  archived: boolean;
  thumbnail: string | null;
};

export type AdminExerciseListParams = {
  search?: string;
  category?: ExerciseCategory;
  level?: ExerciseLevel;
  equipment?: ExerciseEquipment;
  muscle?: Muscle;
  origin?: AdminExerciseOrigin;
  clinicId?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
};

export type AdminExerciseListResult = {
  items: AdminExerciseListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** Shared WHERE for the admin exercise listing (no tenant scope — admin sees all). */
function adminExerciseWhere(params: AdminExerciseListParams) {
  const conds: SQL[] = [];
  if (!params.includeArchived) conds.push(eq(schema.exercise.archived, false));
  if (params.category) conds.push(eq(schema.exercise.category, params.category));
  if (params.level) conds.push(eq(schema.exercise.level, params.level));
  if (params.equipment) {
    conds.push(eq(schema.exercise.equipment, params.equipment));
  }
  if (params.muscle) {
    conds.push(
      sql`(${params.muscle} = any(${schema.exercise.primaryMuscles})
        or ${params.muscle} = any(${schema.exercise.secondaryMuscles}))`,
    );
  }
  if (params.origin === "base") conds.push(isNull(schema.exercise.clinicId));
  if (params.origin === "clinic") conds.push(isNotNull(schema.exercise.clinicId));
  if (params.clinicId) conds.push(eq(schema.exercise.clinicId, params.clinicId));
  const term = params.search?.trim();
  if (term) {
    for (const token of term.split(/\s+/)) {
      conds.push(
        sql`${schema.exercise.searchText} like '%' || unaccent(lower(${token})) || '%'`,
      );
    }
  }
  return conds.length ? and(...conds) : undefined;
}

/**
 * Every exercise on the platform (base + all clinics), filtered and paginated.
 * Cross-tenant by design — admin only. Each clinic exercise carries its clinic
 * name.
 */
export async function listAllExercises(
  db: DB,
  params: AdminExerciseListParams = {},
): Promise<AdminExerciseListResult> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 24)));
  const where = adminExerciseWhere(params);
  const term = params.search?.trim();

  const orderBy = term
    ? [
        desc(sql`similarity(${schema.exercise.searchText}, unaccent(lower(${term})))`),
        asc(schema.exercise.name),
      ]
    : [asc(schema.exercise.name), asc(schema.exercise.id)];

  const rows = await db
    .select({
      id: schema.exercise.id,
      code: schema.exercise.code,
      name: schema.exercise.name,
      category: schema.exercise.category,
      level: schema.exercise.level,
      equipment: schema.exercise.equipment,
      primaryMuscles: schema.exercise.primaryMuscles,
      images: schema.exercise.images,
      archived: schema.exercise.archived,
      clinicId: schema.exercise.clinicId,
      clinicName: schema.clinic.name,
    })
    .from(schema.exercise)
    .leftJoin(schema.clinic, eq(schema.exercise.clinicId, schema.clinic.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.exercise)
    .where(where);

  const items: AdminExerciseListItem[] = rows.map(
    ({ clinicId, clinicName, images, ...r }) => ({
      ...r,
      origin: clinicId === null ? "base" : "clinic",
      clinicName: clinicId === null ? null : clinicName,
      thumbnail: images[0] ?? null,
    }),
  );

  return { items, total, page, pageSize };
}

export type AdminExerciseDetail = Exercise & {
  origin: AdminExerciseOrigin;
  clinicName: string | null;
  substitutes: ExerciseSubstituteRow[];
};

/**
 * Any single exercise (base or any clinic's), with its clinic name and its
 * **base** substitutions (the ones the admin manages). Cross-tenant — admin
 * only. Returns null when the id doesn't exist.
 */
export async function getAnyExercise(
  db: DB,
  id: string,
): Promise<AdminExerciseDetail | null> {
  const [row] = await db
    .select({
      exercise: schema.exercise,
      clinicName: schema.clinic.name,
    })
    .from(schema.exercise)
    .leftJoin(schema.clinic, eq(schema.exercise.clinicId, schema.clinic.id))
    .where(eq(schema.exercise.id, id));
  if (!row) return null;

  const substitute = schema.exercise;
  const subs = await db
    .select({
      id: schema.exerciseSubstitution.id,
      exerciseId: substitute.id,
      name: substitute.name,
      code: substitute.code,
      category: substitute.category,
      equipment: substitute.equipment,
      images: substitute.images,
      clinicId: substitute.clinicId,
    })
    .from(schema.exerciseSubstitution)
    .innerJoin(
      substitute,
      eq(schema.exerciseSubstitution.substituteExerciseId, substitute.id),
    )
    .where(
      and(
        eq(schema.exerciseSubstitution.exerciseId, id),
        isNull(schema.exerciseSubstitution.clinicId),
        eq(substitute.archived, false),
      ),
    )
    .orderBy(asc(substitute.name));

  return {
    ...row.exercise,
    origin: row.exercise.clinicId === null ? "base" : "clinic",
    clinicName: row.exercise.clinicId === null ? null : row.clinicName,
    substitutes: subs.map(({ clinicId, images, ...s }) => ({
      ...s,
      thumbnail: images[0] ?? null,
      origin: clinicId === null ? "base" : "clinic",
      removable: true, // every base rule is admin-removable
    })),
  };
}

/** Maps the write input to the base-exercise columns (tenant/searchText set below). */
function baseExerciseValues(input: ExerciseWriteInput) {
  return {
    name: input.name,
    description: input.description,
    searchText: sql`unaccent(lower(${input.name}))`,
    category: input.category,
    level: input.level,
    force: input.force,
    mechanic: input.mechanic,
    equipment: input.equipment,
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles,
    instructions: input.instructions,
    images: input.images,
  };
}

/** Creates a shared **base** exercise (`clinic_id NULL`, `source = "custom"`, no code). */
export async function createBaseExercise(
  db: DB,
  input: ExerciseWriteInput,
): Promise<Exercise> {
  const [row] = await db
    .insert(schema.exercise)
    .values({ clinicId: null, code: null, source: "custom", ...baseExerciseValues(input) })
    .returning();
  return row;
}

/**
 * Edits a shared **base** exercise. Scoped to `clinic_id IS NULL`, so a clinic's
 * own exercise is never touched (returns null — a 404 at the route).
 */
export async function updateBaseExercise(
  db: DB,
  id: string,
  input: ExerciseWriteInput,
): Promise<Exercise | null> {
  const [row] = await db
    .update(schema.exercise)
    .set({ ...baseExerciseValues(input), updatedAt: new Date() })
    .where(and(eq(schema.exercise.id, id), isNull(schema.exercise.clinicId)))
    .returning();
  return row ?? null;
}

/** Archives a shared **base** exercise (`clinic_id IS NULL` only). */
export async function archiveBaseExercise(
  db: DB,
  id: string,
): Promise<Exercise | null> {
  const [row] = await db
    .update(schema.exercise)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(schema.exercise.id, id), isNull(schema.exercise.clinicId)))
    .returning();
  return row ?? null;
}

/**
 * Archives ANY exercise — base or a clinic's own. This is the one exception to
 * the "admin writes base only" rule: as a moderation action the platform admin
 * may retire any exercise from the catalog (editing a clinic exercise is still
 * off-limits — only archiving). Cross-tenant by design; admin only. Returns null
 * when the id doesn't exist.
 */
export async function archiveAnyExercise(
  db: DB,
  id: string,
): Promise<Exercise | null> {
  const [row] = await db
    .update(schema.exercise)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(schema.exercise.id, id))
    .returning();
  return row ?? null;
}

/**
 * Restores (unarchives) ANY exercise — base or a clinic's own — the moderation
 * counterpart of {@link archiveAnyExercise}. Cross-tenant; admin only. Returns
 * null when the id doesn't exist.
 */
export async function unarchiveAnyExercise(
  db: DB,
  id: string,
): Promise<Exercise | null> {
  const [row] = await db
    .update(schema.exercise)
    .set({ archived: false, updatedAt: new Date() })
    .where(eq(schema.exercise.id, id))
    .returning();
  return row ?? null;
}

/** Whether an exercise exists and is a shared **base** exercise (`clinic_id NULL`). */
async function baseExerciseExists(db: DB, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.exercise.id })
    .from(schema.exercise)
    .where(and(eq(schema.exercise.id, id), isNull(schema.exercise.clinicId)));
  return Boolean(row);
}

export type AddBaseExerciseSubstitutionResult =
  | { ok: true; substitute: ExerciseSubstituteRow }
  | {
      ok: false;
      reason:
        | "exercise_not_found"
        | "substitute_not_found"
        | "same_exercise"
        | "duplicate";
    };

/**
 * Adds a shared **base** substitution rule (`clinic_id NULL`): the substitute
 * exercise may replace the exercise. Both the exercise and its substitute MUST
 * be base exercises — a base rule pointing at a clinic's own exercise would leak
 * that exercise to every tenant, so a non-base id is rejected as "not found".
 * Self-substitution and duplicates are rejected too.
 */
export async function addBaseExerciseSubstitution(
  db: DB,
  exerciseId: string,
  substituteExerciseId: string,
): Promise<AddBaseExerciseSubstitutionResult> {
  if (exerciseId === substituteExerciseId) {
    return { ok: false, reason: "same_exercise" };
  }
  if (!(await baseExerciseExists(db, exerciseId))) {
    return { ok: false, reason: "exercise_not_found" };
  }
  if (!(await baseExerciseExists(db, substituteExerciseId))) {
    return { ok: false, reason: "substitute_not_found" };
  }
  const [dupe] = await db
    .select({ id: schema.exerciseSubstitution.id })
    .from(schema.exerciseSubstitution)
    .where(
      and(
        isNull(schema.exerciseSubstitution.clinicId),
        eq(schema.exerciseSubstitution.exerciseId, exerciseId),
        eq(schema.exerciseSubstitution.substituteExerciseId, substituteExerciseId),
      ),
    );
  if (dupe) return { ok: false, reason: "duplicate" };

  const [ins] = await db
    .insert(schema.exerciseSubstitution)
    .values({ clinicId: null, exerciseId, substituteExerciseId })
    .returning({ id: schema.exerciseSubstitution.id });
  const [sub] = await db
    .select({
      name: schema.exercise.name,
      code: schema.exercise.code,
      category: schema.exercise.category,
      equipment: schema.exercise.equipment,
      images: schema.exercise.images,
    })
    .from(schema.exercise)
    .where(eq(schema.exercise.id, substituteExerciseId));

  return {
    ok: true,
    substitute: {
      id: ins.id,
      exerciseId: substituteExerciseId,
      name: sub.name,
      code: sub.code,
      category: sub.category,
      equipment: sub.equipment,
      thumbnail: sub.images[0] ?? null,
      origin: "base",
      removable: true,
    },
  };
}

/** Removes a shared **base** exercise substitution rule (`clinic_id NULL` only). */
export async function removeBaseExerciseSubstitution(
  db: DB,
  exerciseId: string,
  substitutionId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(schema.exerciseSubstitution)
    .where(
      and(
        eq(schema.exerciseSubstitution.id, substitutionId),
        eq(schema.exerciseSubstitution.exerciseId, exerciseId),
        isNull(schema.exerciseSubstitution.clinicId),
      ),
    )
    .returning({ id: schema.exerciseSubstitution.id });
  return deleted.length > 0;
}

/* -------------------------------------------------------------------------- */
/*  Anamneses (data maintenance — cross-clinic)                                */
/*                                                                            */
/*  The admin sees EVERY clinic's anamneses, tagged by provenance             */
/*  (`source_key` non-null ⇒ seeded/imported from the system starter set;      */
/*  null ⇒ coach-authored). Admin can hard-delete any of them, and import the  */
/*  system starters into a chosen clinic (idempotent by `source_key`).         */
/* -------------------------------------------------------------------------- */

export type AdminAnamnesisOrigin = "system" | "clinic";

export type AdminAnamnesisRow = {
  id: string;
  name: string;
  clinicId: string;
  clinicName: string;
  sourceKey: string | null;
  objective: AnamnesisObjective;
  modality: AnamnesisModality;
  updatedAt: Date;
  /** How many students were assigned from this anamnese (snapshots survive delete). */
  studentUsageCount: number;
};

export type AdminAnamnesisListParams = {
  clinicId?: string;
  origin?: AdminAnamnesisOrigin;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type AdminAnamnesisListResult = {
  items: AdminAnamnesisRow[];
  total: number;
  page: number;
  pageSize: number;
};

function adminAnamnesisWhere(params: AdminAnamnesisListParams) {
  const conds: SQL[] = [];
  if (params.clinicId) conds.push(eq(schema.anamnesis.clinicId, params.clinicId));
  if (params.origin === "system") conds.push(isNotNull(schema.anamnesis.sourceKey));
  if (params.origin === "clinic") conds.push(isNull(schema.anamnesis.sourceKey));
  const term = params.search?.trim();
  if (term) {
    conds.push(
      sql`unaccent(lower(${schema.anamnesis.name})) like '%' || unaccent(lower(${term})) || '%'`,
    );
  }
  return conds.length ? and(...conds) : undefined;
}

/**
 * A page of every clinic's anamneses (ordered by clinic then name), each with
 * its clinic name, provenance and student-usage count. Cross-tenant — admin only.
 */
export async function listAnamnesesAcrossClinics(
  db: DB,
  params: AdminAnamnesisListParams = {},
): Promise<AdminAnamnesisListResult> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 25)));
  const where = adminAnamnesisWhere(params);

  const usage = sql<number>`(select count(*)::int from student_anamnesis sa where sa.source_anamnesis_id = ${schema.anamnesis.id})`;

  const rows = await db
    .select({
      id: schema.anamnesis.id,
      name: schema.anamnesis.name,
      clinicId: schema.anamnesis.clinicId,
      clinicName: schema.clinic.name,
      sourceKey: schema.anamnesis.sourceKey,
      objective: schema.anamnesis.objective,
      modality: schema.anamnesis.modality,
      updatedAt: schema.anamnesis.updatedAt,
      studentUsageCount: usage,
    })
    .from(schema.anamnesis)
    .innerJoin(schema.clinic, eq(schema.clinic.id, schema.anamnesis.clinicId))
    .where(where)
    .orderBy(asc(schema.clinic.name), asc(schema.anamnesis.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.anamnesis)
    .where(where);

  return { items: rows, total, page, pageSize };
}

/** Hard-deletes any anamnese (cross-tenant). Returns false when the id is unknown. */
export async function hardDeleteAnamnesis(db: DB, id: string): Promise<boolean> {
  const rows = await db
    .delete(schema.anamnesis)
    .where(eq(schema.anamnesis.id, id))
    .returning({ id: schema.anamnesis.id });
  return rows.length > 0;
}

export type ImportStartersResult =
  | { ok: true; imported: string[]; skipped: string[] }
  | { ok: false; reason: "clinic_not_found" | "no_valid_keys" };

/**
 * Imports the selected system starters into a clinic, idempotently: starters the
 * clinic already has (matched by `source_key`) are skipped. Imported rows carry
 * the CURRENT starter JSON (masks/keys) and `coach_id = clinic.owner`.
 */
export async function importStartersToClinic(
  db: DB,
  clinicId: string,
  keys: string[],
): Promise<ImportStartersResult> {
  const [clinicRow] = await db
    .select({ ownerUserId: schema.clinic.ownerUserId })
    .from(schema.clinic)
    .where(eq(schema.clinic.id, clinicId));
  if (!clinicRow) return { ok: false, reason: "clinic_not_found" };

  const wanted = STARTER_ANAMNESES.filter((s) => keys.includes(s.key));
  if (wanted.length === 0) return { ok: false, reason: "no_valid_keys" };

  const existing = await db
    .select({ sourceKey: schema.anamnesis.sourceKey })
    .from(schema.anamnesis)
    .where(
      and(
        eq(schema.anamnesis.clinicId, clinicId),
        inArray(
          schema.anamnesis.sourceKey,
          wanted.map((s) => s.key),
        ),
      ),
    );
  const have = new Set(existing.map((e) => e.sourceKey));
  const toImport = wanted.filter((s) => !have.has(s.key));

  if (toImport.length > 0) {
    await db.insert(schema.anamnesis).values(
      toImport.map((s) => ({
        clinicId,
        coachId: clinicRow.ownerUserId,
        sourceKey: s.key,
        name: s.name,
        description: s.description,
        objective: s.objective,
        modality: s.modality,
        sections: s.sections,
      })),
    );
  }

  return {
    ok: true,
    imported: toImport.map((s) => s.key),
    skipped: wanted.filter((s) => have.has(s.key)).map((s) => s.key),
  };
}
