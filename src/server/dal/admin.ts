import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";

import { type DB, schema } from "@/db";
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
import type { FoodNutrientRow, FoodSubstituteRow } from "@/server/dal/foods";

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
};

/**
 * Any single exercise (base or any clinic's), with its clinic name. Cross-tenant
 * — admin only. Returns null when the id doesn't exist.
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
  return {
    ...row.exercise,
    origin: row.exercise.clinicId === null ? "base" : "clinic",
    clinicName: row.exercise.clinicId === null ? null : row.clinicName,
  };
}
