import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { schema } from "@/db";
import type { DietFoodSubstituteDto } from "@/lib/diets";
import { dietChanged } from "@/lib/plan-changes";
import type { TenantContext } from "@/server/tenant";
import {
  EMPTY_STRUCTURE,
  type DietStructure,
  type DietTree,
  type StructFoodRef,
  type StudentDietDraftDto,
  type StudentDietHistoryDto,
  type StudentDietPublishedDto,
  type StudentDietStateDto,
  type StudentDietVersionDto,
  type TreeFoodLine,
  type TreeMacros,
} from "@/lib/student-diets";
import { createDiet, getDiet, type DietWriteInput } from "./diets";

/**
 * Student-diet DAL. Every read and write is scoped by `ctx.clinicId` (+ the
 * `studentId`). A version stores only the **prescription structure** (food +
 * quantity refs); nutrition and catalog substitutions are derived live from the
 * catalog on read (`hydrateStructure`), so a coach's catalog correction reaches
 * every student without a re-publish. Publishing numbers a version (1..N); the
 * first publish of a new diet archives the student's previous one.
 *
 * At most one draft version exists per student at a time (across all their
 * diets), so the Dieta tab is always in exactly one of: draft / current / empty.
 */

/* -------------------------------------------------------------------------- */
/*  Structure → live tree hydration (from the current catalog)                 */
/* -------------------------------------------------------------------------- */

type FoodRow = {
  id: string;
  description: string;
  code: string | null;
  clinicId: string | null;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
};

function scale(value: number | null, grams: number): number | null {
  if (value === null || value === undefined) return null;
  return (value * grams) / 100;
}

function per100Of(f: FoodRow): TreeMacros {
  return {
    energyKcal: f.energyKcal,
    protein: f.protein,
    carbohydrate: f.carbohydrate,
    fat: f.fat,
  };
}

function macrosFor(f: FoodRow, grams: number): TreeMacros {
  return {
    energyKcal: scale(f.energyKcal, grams),
    protein: scale(f.protein, grams),
    carbohydrate: scale(f.carbohydrate, grams),
    fat: scale(f.fat, grams),
  };
}

function addMacro(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function sumMacros(list: TreeMacros[]): TreeMacros {
  return list.reduce<TreeMacros>(
    (acc, m) => ({
      energyKcal: addMacro(acc.energyKcal, m.energyKcal),
      protein: addMacro(acc.protein, m.protein),
      carbohydrate: addMacro(acc.carbohydrate, m.carbohydrate),
      fat: addMacro(acc.fat, m.fat),
    }),
    { energyKcal: null, protein: null, carbohydrate: null, fat: null },
  );
}

function lineFrom(
  f: FoodRow,
  grams: number,
  measureLabel: string | null | undefined,
  measureGrams: number | null | undefined,
): TreeFoodLine {
  return {
    foodId: f.id,
    description: f.description,
    code: f.code,
    origin: f.clinicId === null ? "base" : "clinic",
    grams,
    measureLabel: measureLabel ?? null,
    measureGrams: measureGrams ?? null,
    per100: per100Of(f),
    macros: macrosFor(f, grams),
  };
}

/** Every distinct foodId referenced by a structure (item foods only). */
function referencedFoodIds(structure: DietStructure): string[] {
  const ids = new Set<string>();
  for (const meal of structure.meals) {
    for (const item of meal.items) ids.add(item.foodId);
  }
  return [...ids];
}

/**
 * The persisted structure for a write payload — **food + quantity only**. Any
 * per-item equivalences the builder may carry are dropped: a student diet stores
 * just the prescription, and swaps are the food's catalog substitutes, live.
 */
function toStructure(input: DietWriteInput): DietStructure {
  return {
    meals: input.meals.map((m) => ({
      name: m.name,
      time: m.time,
      items: m.items.map((it) => ({
        foodId: it.foodId,
        grams: it.grams,
        measureLabel: it.measureLabel ?? null,
        measureGrams: it.measureGrams ?? null,
      })),
    })),
  };
}

/** Loads the given foods scoped to what this clinic can see (base + own). */
async function selectFoods(
  ctx: TenantContext,
  ids: string[],
): Promise<Map<string, FoodRow>> {
  if (ids.length === 0) return new Map();
  const rows = await ctx.db
    .select({
      id: schema.food.id,
      description: schema.food.description,
      code: schema.food.code,
      clinicId: schema.food.clinicId,
      energyKcal: schema.food.energyKcal,
      protein: schema.food.protein,
      carbohydrate: schema.food.carbohydrate,
      fat: schema.food.fat,
    })
    .from(schema.food)
    .where(
      and(
        inArray(schema.food.id, ids),
        or(isNull(schema.food.clinicId), eq(schema.food.clinicId, ctx.clinicId)),
      ),
    );
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * The write-time `invalid_food` guard: every referenced food must be visible to
 * the clinic (base or own), so a structure can never point at another clinic's
 * data or a non-existent id.
 */
async function allFoodsVisible(
  ctx: TenantContext,
  structure: DietStructure,
): Promise<boolean> {
  const ids = referencedFoodIds(structure);
  const map = await selectFoods(ctx, ids);
  return map.size === ids.length;
}

const NULL_MACROS: TreeMacros = {
  energyKcal: null,
  protein: null,
  carbohydrate: null,
  fat: null,
};

/** A placeholder line for a ref whose food is no longer visible (hard-deleted). */
function missingLine(ref: StructFoodRef): TreeFoodLine {
  return {
    foodId: ref.foodId,
    description: "Alimento indisponível",
    code: null,
    origin: "base",
    grams: ref.grams,
    measureLabel: ref.measureLabel ?? null,
    measureGrams: ref.measureGrams ?? null,
    per100: NULL_MACROS,
    macros: NULL_MACROS,
  };
}

/**
 * Hydrates a stored **structure** into a read `DietTree` from the CURRENT
 * catalog: embeds each food's description + macros (scaled to the portion),
 * computes per-meal / diet totals, and attaches the food's live catalog
 * substitutes. Because it reads live, a coach's catalog correction (macros,
 * substitutions) reaches every student without a re-publish. A ref whose food is
 * no longer visible becomes an "Alimento indisponível" placeholder (null macros).
 */
export async function hydrateStructure(
  ctx: TenantContext,
  structure: DietStructure,
): Promise<DietTree> {
  const foods = await selectFoods(ctx, referencedFoodIds(structure));
  const itemFoodIds = [
    ...new Set(structure.meals.flatMap((m) => m.items.map((it) => it.foodId))),
  ];
  const catalogByFood = await loadCatalogSubstitutes(ctx, itemFoodIds);

  const lineFor = (ref: StructFoodRef): TreeFoodLine => {
    const f = foods.get(ref.foodId);
    return f
      ? lineFrom(f, ref.grams, ref.measureLabel, ref.measureGrams)
      : missingLine(ref);
  };

  const meals = structure.meals.map((m) => {
    const items = m.items.map((ref) => ({
      ...lineFor(ref),
      // Student diets store no per-item equivalences — swaps come live from the
      // food's catalog substitutes below.
      substitutes: [],
      foodSubstitutes: catalogByFood.get(ref.foodId) ?? [],
    }));
    return {
      name: m.name,
      time: m.time,
      totals: sumMacros(items.map((i) => i.macros)),
      items,
    };
  });
  return { totals: sumMacros(meals.map((m) => m.totals)), meals };
}

/**
 * The catalog substitutes (base + this clinic's) for a set of item foods, keyed
 * by the item foodId. `grams` is per 100 g of the item's food (as stored),
 * scaled to the portion at render time.
 */
async function loadCatalogSubstitutes(
  ctx: TenantContext,
  foodIds: string[],
): Promise<Map<string, DietFoodSubstituteDto[]>> {
  const byFood = new Map<string, DietFoodSubstituteDto[]>();
  if (foodIds.length === 0) return byFood;

  const rows = await ctx.db
    .select({
      foodId: schema.foodSubstitution.foodId,
      grams: schema.foodSubstitution.grams,
      subFoodId: schema.food.id,
      description: schema.food.description,
    })
    .from(schema.foodSubstitution)
    .innerJoin(
      schema.food,
      eq(schema.foodSubstitution.substituteFoodId, schema.food.id),
    )
    .where(
      and(
        inArray(schema.foodSubstitution.foodId, foodIds),
        or(
          isNull(schema.foodSubstitution.clinicId),
          eq(schema.foodSubstitution.clinicId, ctx.clinicId),
        ),
      ),
    )
    .orderBy(asc(schema.food.description));

  for (const r of rows) {
    const list = byFood.get(r.foodId) ?? [];
    list.push({ foodId: r.subFoodId, description: r.description, grams: r.grams });
    byFood.set(r.foodId, list);
  }
  return byFood;
}

/** Whether a structure has at least one food item (required to publish). */
function structureHasItems(structure: DietStructure): boolean {
  return structure.meals.some((m) => m.items.length > 0);
}

/** Rebuilds a `DietWriteInput` from a stored tree (for save-as-template). */
function treeToWriteInput(name: string, tree: DietTree): DietWriteInput {
  return {
    name,
    notes: null,
    meals: tree.meals.map((m) => ({
      name: m.name,
      time: m.time,
      items: m.items.map((it) => ({
        foodId: it.foodId,
        grams: it.grams,
        measureLabel: it.measureLabel,
        measureGrams: it.measureGrams,
        substitutes: it.substitutes.map((s) => ({
          foodId: s.foodId,
          grams: s.grams,
          measureLabel: s.measureLabel,
          measureGrams: s.measureGrams,
        })),
      })),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/*  Lookups                                                                    */
/* -------------------------------------------------------------------------- */

/** Whether the student exists inside this clinic (guards every operation). */
async function studentInClinic(
  ctx: TenantContext,
  studentId: string,
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.id, studentId),
        eq(schema.students.clinicId, ctx.clinicId),
      ),
    );
  return Boolean(row);
}

type DraftHandle = {
  diet: typeof schema.studentDiet.$inferSelect;
  version: typeof schema.studentDietVersion.$inferSelect;
};

/** The single in-flight draft version for this student, with its diet, or null. */
async function findDraft(
  ctx: TenantContext,
  studentId: string,
): Promise<DraftHandle | null> {
  const [row] = await ctx.db
    .select({ diet: schema.studentDiet, version: schema.studentDietVersion })
    .from(schema.studentDietVersion)
    .innerJoin(
      schema.studentDiet,
      eq(schema.studentDietVersion.studentDietId, schema.studentDiet.id),
    )
    .where(
      and(
        eq(schema.studentDiet.clinicId, ctx.clinicId),
        eq(schema.studentDiet.studentId, studentId),
        eq(schema.studentDietVersion.status, "draft"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Results                                                                    */
/* -------------------------------------------------------------------------- */

export type StudentDietWriteResult =
  | { ok: true; dietId: string; versionId: string }
  | {
      ok: false;
      reason:
        | "not_found"
        | "has_draft"
        | "invalid_food"
        | "no_active"
        | "empty";
    };

export type StudentDietPublishResult =
  | {
      ok: true;
      dietId: string;
      version: number;
      /** True when the draft matched the published version and was closed
       *  instead of numbered — `version` is the one still standing. */
      unchanged: boolean;
    }
  | { ok: false; reason: "not_found" | "invalid_food" | "empty" };

/* -------------------------------------------------------------------------- */
/*  Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Everything the Dieta tab needs in one read: the aluno-visible current version,
 * the in-flight draft (if any) and the history. Returns null when the student
 * isn't in this clinic.
 */
export async function getStudentDietState(
  ctx: TenantContext,
  studentId: string,
): Promise<StudentDietStateDto | null> {
  if (!(await studentInClinic(ctx, studentId))) return null;

  const diets = await ctx.db
    .select()
    .from(schema.studentDiet)
    .where(
      and(
        eq(schema.studentDiet.clinicId, ctx.clinicId),
        eq(schema.studentDiet.studentId, studentId),
      ),
    )
    .orderBy(desc(schema.studentDiet.createdAt), desc(schema.studentDiet.id));

  if (diets.length === 0) {
    return { activeDietId: null, current: null, draft: null, history: [] };
  }

  const dietIds = diets.map((d) => d.id);
  const versions = await ctx.db
    .select()
    .from(schema.studentDietVersion)
    .where(inArray(schema.studentDietVersion.studentDietId, dietIds));

  const publishedByDiet = new Map<
    string,
    (typeof versions)[number][]
  >();
  for (const v of versions) {
    if (v.status !== "published") continue;
    const list = publishedByDiet.get(v.studentDietId) ?? [];
    list.push(v);
    publishedByDiet.set(v.studentDietId, list);
  }
  for (const list of publishedByDiet.values()) {
    list.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  }

  const dietById = new Map(diets.map((d) => [d.id, d]));

  // The single in-flight draft, if any.
  const draftVersion = versions.find((v) => v.status === "draft");
  let draft: StudentDietDraftDto | null = null;
  if (draftVersion) {
    const d = dietById.get(draftVersion.studentDietId)!;
    draft = {
      dietId: d.id,
      dietName: d.name,
      versionId: draftVersion.id,
      isNewDiet: d.status === "draft",
      notes: draftVersion.notes,
      tree: await hydrateStructure(ctx, draftVersion.tree),
    };
  }

  // The aluno-visible current = the active diet's latest published version.
  const active = diets.find((d) => d.status === "active") ?? null;
  let current: StudentDietPublishedDto | null = null;
  if (active) {
    const latest = publishedByDiet.get(active.id)?.[0];
    if (latest) {
      current = {
        dietId: active.id,
        dietName: active.name,
        version: latest.version!,
        publishedAt: latest.publishedAt!.toISOString(),
        notes: latest.notes,
        tree: await hydrateStructure(ctx, latest.tree),
      };
    }
  }

  // History: every diet with published versions (active + archived), newest first.
  const history: StudentDietHistoryDto[] = diets
    .filter((d) => (publishedByDiet.get(d.id)?.length ?? 0) > 0)
    .map((d) => ({
      dietId: d.id,
      dietName: d.name,
      status: d.status === "archived" ? "archived" : "active",
      versions: (publishedByDiet.get(d.id) ?? []).map((v) => ({
        versionId: v.id,
        version: v.version!,
        publishedAt: v.publishedAt!.toISOString(),
      })),
    }));

  return { activeDietId: active?.id ?? null, current, draft, history };
}

/** A single published version's tree, for the read-only history view, or null. */
export async function getStudentDietVersion(
  ctx: TenantContext,
  studentId: string,
  versionId: string,
): Promise<StudentDietVersionDto | null> {
  const [row] = await ctx.db
    .select({ diet: schema.studentDiet, version: schema.studentDietVersion })
    .from(schema.studentDietVersion)
    .innerJoin(
      schema.studentDiet,
      eq(schema.studentDietVersion.studentDietId, schema.studentDiet.id),
    )
    .where(
      and(
        eq(schema.studentDietVersion.id, versionId),
        eq(schema.studentDiet.clinicId, ctx.clinicId),
        eq(schema.studentDiet.studentId, studentId),
        eq(schema.studentDietVersion.status, "published"),
      ),
    );
  if (!row) return null;
  return {
    dietId: row.diet.id,
    dietName: row.diet.name,
    version: row.version.version!,
    publishedAt: row.version.publishedAt!.toISOString(),
    notes: row.version.notes,
    tree: await hydrateStructure(ctx, row.version.tree),
  };
}

/* -------------------------------------------------------------------------- */
/*  Writes                                                                     */
/* -------------------------------------------------------------------------- */

/** Creates a brand-new blank diet (draft v1) for the student. */
export async function createBlankDraft(
  ctx: TenantContext,
  studentId: string,
  name: string,
): Promise<StudentDietWriteResult> {
  if (!(await studentInClinic(ctx, studentId))) {
    return { ok: false, reason: "not_found" };
  }
  if (await findDraft(ctx, studentId)) return { ok: false, reason: "has_draft" };

  return ctx.db.transaction(async (tx) => {
    const [d] = await tx
      .insert(schema.studentDiet)
      .values({ clinicId: ctx.clinicId, studentId, name, status: "draft" })
      .returning({ id: schema.studentDiet.id });
    const [v] = await tx
      .insert(schema.studentDietVersion)
      .values({ studentDietId: d.id, status: "draft", tree: EMPTY_STRUCTURE })
      .returning({ id: schema.studentDietVersion.id });
    return { ok: true, dietId: d.id, versionId: v.id };
  });
}

/** Copies one of the coach's template diets to the student as a draft v1. */
export async function createFromTemplate(
  ctx: TenantContext,
  studentId: string,
  templateId: string,
  name?: string,
): Promise<StudentDietWriteResult> {
  if (!(await studentInClinic(ctx, studentId))) {
    return { ok: false, reason: "not_found" };
  }
  if (await findDraft(ctx, studentId)) return { ok: false, reason: "has_draft" };

  const detail = await getDiet(ctx, templateId);
  if (!detail) return { ok: false, reason: "not_found" };

  const input: DietWriteInput = {
    name: detail.name,
    notes: detail.notes,
    meals: detail.meals.map((m) => ({
      name: m.name,
      time: m.time,
      items: m.items.map((it) => ({
        foodId: it.foodId,
        grams: it.grams,
        measureLabel: it.measureLabel,
        measureGrams: it.measureGrams,
        substitutes: it.substitutes.map((s) => ({
          foodId: s.foodId,
          grams: s.grams,
          measureLabel: s.measureLabel,
          measureGrams: s.measureGrams,
        })),
      })),
    })),
  };
  const structure = toStructure(input);
  if (!(await allFoodsVisible(ctx, structure))) {
    return { ok: false, reason: "invalid_food" };
  }

  return ctx.db.transaction(async (tx) => {
    const [d] = await tx
      .insert(schema.studentDiet)
      .values({
        clinicId: ctx.clinicId,
        studentId,
        name: name?.trim() || detail.name,
        sourceDietId: templateId,
        status: "draft",
      })
      .returning({ id: schema.studentDiet.id });
    const [v] = await tx
      .insert(schema.studentDietVersion)
      .values({
        studentDietId: d.id,
        status: "draft",
        tree: structure,
        notes: detail.notes,
      })
      .returning({ id: schema.studentDietVersion.id });
    return { ok: true, dietId: d.id, versionId: v.id };
  });
}

/**
 * Opens a new draft to edit the active diet: clones its latest published
 * version's tree into a fresh draft version on the same diet (the aluno keeps
 * seeing the published one until this draft is published).
 */
export async function editActive(
  ctx: TenantContext,
  studentId: string,
): Promise<StudentDietWriteResult> {
  if (!(await studentInClinic(ctx, studentId))) {
    return { ok: false, reason: "not_found" };
  }
  if (await findDraft(ctx, studentId)) return { ok: false, reason: "has_draft" };

  const [active] = await ctx.db
    .select()
    .from(schema.studentDiet)
    .where(
      and(
        eq(schema.studentDiet.clinicId, ctx.clinicId),
        eq(schema.studentDiet.studentId, studentId),
        eq(schema.studentDiet.status, "active"),
      ),
    );
  if (!active) return { ok: false, reason: "no_active" };

  const [latest] = await ctx.db
    .select()
    .from(schema.studentDietVersion)
    .where(
      and(
        eq(schema.studentDietVersion.studentDietId, active.id),
        eq(schema.studentDietVersion.status, "published"),
      ),
    )
    .orderBy(desc(schema.studentDietVersion.version))
    .limit(1);

  const [v] = await ctx.db
    .insert(schema.studentDietVersion)
    .values({
      studentDietId: active.id,
      status: "draft",
      tree: latest?.tree ?? EMPTY_STRUCTURE,
      notes: latest?.notes ?? null,
    })
    .returning({ id: schema.studentDietVersion.id });
  return { ok: true, dietId: active.id, versionId: v.id };
}

/** Saves the in-flight draft (name + tree + notes). Does not publish. */
export async function saveDraft(
  ctx: TenantContext,
  studentId: string,
  input: DietWriteInput,
): Promise<StudentDietWriteResult> {
  const draft = await findDraft(ctx, studentId);
  if (!draft) return { ok: false, reason: "not_found" };

  const structure = toStructure(input);
  if (!(await allFoodsVisible(ctx, structure))) {
    return { ok: false, reason: "invalid_food" };
  }

  await ctx.db.transaction(async (tx) => {
    await tx
      .update(schema.studentDiet)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(schema.studentDiet.id, draft.diet.id));
    await tx
      .update(schema.studentDietVersion)
      .set({ tree: structure, notes: input.notes, updatedAt: new Date() })
      .where(eq(schema.studentDietVersion.id, draft.version.id));
  });
  return { ok: true, dietId: draft.diet.id, versionId: draft.version.id };
}

/**
 * Publishes the in-flight draft: saves the payload, numbers the version
 * (1..N per diet) and freezes it. The first publish of a brand-new diet marks
 * it active and archives the student's previously-active diet. Requires at least
 * one food item.
 */
export async function publishDraft(
  ctx: TenantContext,
  studentId: string,
  input: DietWriteInput,
): Promise<StudentDietPublishResult> {
  const draft = await findDraft(ctx, studentId);
  if (!draft) return { ok: false, reason: "not_found" };

  const structure = toStructure(input);
  if (!(await allFoodsVisible(ctx, structure))) {
    return { ok: false, reason: "invalid_food" };
  }
  if (!structureHasItems(structure)) return { ok: false, reason: "empty" };

  // Nothing changed → close the draft and leave the published version standing:
  // no duplicate in the histórico, no notification about a dieta that did not
  // move. A brand-new diet has no predecessor, so it always publishes.
  const [previous] = await ctx.db
    .select()
    .from(schema.studentDietVersion)
    .where(
      and(
        eq(schema.studentDietVersion.studentDietId, draft.diet.id),
        eq(schema.studentDietVersion.status, "published"),
      ),
    )
    .orderBy(desc(schema.studentDietVersion.version))
    .limit(1);
  if (
    previous &&
    !dietChanged(
      { name: input.name, notes: input.notes, tree: structure },
      { name: draft.diet.name, notes: previous.notes, tree: previous.tree },
    )
  ) {
    await discardDraft(ctx, studentId);
    return {
      ok: true,
      dietId: draft.diet.id,
      version: previous.version!,
      unchanged: true,
    };
  }

  return ctx.db.transaction(async (tx) => {
    const [{ max }] = await tx
      .select({
        max: sql<number>`coalesce(max(${schema.studentDietVersion.version}), 0)`,
      })
      .from(schema.studentDietVersion)
      .where(eq(schema.studentDietVersion.studentDietId, draft.diet.id));
    const nextVersion = Number(max) + 1;

    await tx
      .update(schema.studentDiet)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(schema.studentDiet.id, draft.diet.id));

    await tx
      .update(schema.studentDietVersion)
      .set({
        tree: structure,
        notes: input.notes,
        status: "published",
        version: nextVersion,
        publishedAt: new Date(),
        publishedBy: ctx.userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.studentDietVersion.id, draft.version.id));

    // A brand-new diet's first publish becomes active and archives the old one.
    if (draft.diet.status === "draft") {
      await tx
        .update(schema.studentDiet)
        .set({ status: "archived", updatedAt: new Date() })
        .where(
          and(
            eq(schema.studentDiet.clinicId, ctx.clinicId),
            eq(schema.studentDiet.studentId, studentId),
            eq(schema.studentDiet.status, "active"),
          ),
        );
      await tx
        .update(schema.studentDiet)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(schema.studentDiet.id, draft.diet.id));
    }

    return {
      ok: true,
      dietId: draft.diet.id,
      version: nextVersion,
      unchanged: false,
    };
  });
}

/**
 * Discards the in-flight draft. If it was a brand-new diet (no published
 * versions), the whole `student_diet` is removed too. Returns false if there is
 * no draft.
 */
export async function discardDraft(
  ctx: TenantContext,
  studentId: string,
): Promise<boolean> {
  const draft = await findDraft(ctx, studentId);
  if (!draft) return false;

  await ctx.db.transaction(async (tx) => {
    await tx
      .delete(schema.studentDietVersion)
      .where(eq(schema.studentDietVersion.id, draft.version.id));
    if (draft.diet.status === "draft") {
      // A brand-new diet with only this draft — remove the container too.
      await tx
        .delete(schema.studentDiet)
        .where(eq(schema.studentDiet.id, draft.diet.id));
    }
  });
  return true;
}

export type SaveAsTemplateResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "invalid_food" };

/**
 * Exports a student's diet version to the clinic's template catalog: builds a
 * new `diet` from the version's tree (reusing `createDiet`, which re-checks food
 * visibility). Defaults to the active diet's latest published version; pass a
 * `versionId` to export a specific one.
 */
export async function saveAsTemplate(
  ctx: TenantContext,
  studentId: string,
  versionId?: string,
): Promise<SaveAsTemplateResult> {
  let source: StudentDietVersionDto | null = null;
  if (versionId) {
    source = await getStudentDietVersion(ctx, studentId, versionId);
  } else {
    const state = await getStudentDietState(ctx, studentId);
    if (state?.current) {
      source = {
        dietId: state.current.dietId,
        dietName: state.current.dietName,
        version: state.current.version,
        publishedAt: state.current.publishedAt,
        notes: state.current.notes,
        tree: state.current.tree,
      };
    }
  }
  if (!source) return { ok: false, reason: "not_found" };

  const res = await createDiet(ctx, treeToWriteInput(source.dietName, source.tree));
  if (!res.ok) return { ok: false, reason: "invalid_food" };
  return { ok: true, id: res.id };
}

/* -------------------------------------------------------------------------- */
/*  History deletes                                                            */
/* -------------------------------------------------------------------------- */

export type DeleteStudentDietVersionResult =
  | { ok: true; deletedDiet: boolean }
  | { ok: false; reason: "not_found" | "current" };

/**
 * Permanently removes ONE published version from the student's diet history.
 *
 * The aluno-visible version — the active diet's newest published one — is
 * refused (`current`): deleting it would silently change what the student is
 * following. Everything the Histórico offers (older versions of the current
 * diet, and every version of an archived one) can go, one at a time.
 *
 * When the version was the last one of its diet, the empty `student_diet` goes
 * with it, so no nameless shell survives in the history. Check-ins that
 * snapshotted this version keep their label — the FK is `set null` and the
 * name/number are copied onto the check-in row.
 */
export async function deleteStudentDietVersion(
  ctx: TenantContext,
  studentId: string,
  versionId: string,
): Promise<DeleteStudentDietVersionResult> {
  const [row] = await ctx.db
    .select({ diet: schema.studentDiet, version: schema.studentDietVersion })
    .from(schema.studentDietVersion)
    .innerJoin(
      schema.studentDiet,
      eq(schema.studentDietVersion.studentDietId, schema.studentDiet.id),
    )
    .where(
      and(
        eq(schema.studentDietVersion.id, versionId),
        eq(schema.studentDiet.clinicId, ctx.clinicId),
        eq(schema.studentDiet.studentId, studentId),
        eq(schema.studentDietVersion.status, "published"),
      ),
    );
  if (!row) return { ok: false, reason: "not_found" };

  // Every sibling version of the same diet — tells both whether this one is the
  // current (newest published of an active diet) and whether it is the last.
  const siblings = await ctx.db
    .select({
      id: schema.studentDietVersion.id,
      version: schema.studentDietVersion.version,
      status: schema.studentDietVersion.status,
    })
    .from(schema.studentDietVersion)
    .where(eq(schema.studentDietVersion.studentDietId, row.diet.id));

  const newestPublished = siblings
    .filter((v) => v.status === "published")
    .reduce((max, v) => Math.max(max, v.version ?? 0), 0);
  if (
    row.diet.status === "active" &&
    (row.version.version ?? 0) === newestPublished
  ) {
    return { ok: false, reason: "current" };
  }

  const lastOne = siblings.every((v) => v.id === versionId);

  await ctx.db.transaction(async (tx) => {
    await tx
      .delete(schema.studentDietVersion)
      .where(eq(schema.studentDietVersion.id, versionId));
    if (lastOne) {
      await tx
        .delete(schema.studentDiet)
        .where(eq(schema.studentDiet.id, row.diet.id));
    }
  });
  return { ok: true, deletedDiet: lastOne };
}
