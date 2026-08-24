import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";

import { type DB, schema } from "@/db";
import { STARTER_ANAMNESES } from "@/server/anamneses/starter-templates";

/**
 * Diets & workouts (data maintenance — cross-clinic)
 *
 * Same shape as the anamnese maintenance above: the admin sees every clinic's
 * diets/workouts tagged by provenance (`source_key` non-null ⇒ seeded/
 * imported from the system starter set; null ⇒ coach-authored), can
 * hard-delete any, and import the system starters into a clinic. The import
 * itself (which must resolve base-catalog slugs) lives in dal/starters.ts;
 * here are the cross-clinic reads + delete.
 *
 * Part of the admin DAL: takes a raw {@link DB} handle and is intentionally NOT
 * clinic-scoped. See `./index.ts` for why that exception exists and what gates
 * it.
 */

/** system = seeded/imported starter; clinic = coach-authored. */
export type AdminTemplateOrigin = "system" | "clinic";

export type AdminTemplateRow = {
  id: string;
  name: string;
  clinicId: string;
  clinicName: string;
  sourceKey: string | null;
  origin: AdminTemplateOrigin;
  archived: boolean;
  updatedAt: Date;
  /** How many student copies were made from this template (via source_*_id). */
  studentUsageCount: number;
};

export type AdminTemplateListParams = {
  clinicId?: string;
  origin?: AdminTemplateOrigin;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type AdminTemplateListResult = {
  items: AdminTemplateRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * A page of every clinic's diets (ordered by clinic then name), each with its
 * clinic name, provenance and student-usage count. Base diets (clinic_id NULL)
 * are excluded by the inner join — this feature only creates clinic-owned copies.
 */
export async function listDietsAcrossClinics(
  db: DB,
  params: AdminTemplateListParams = {},
): Promise<AdminTemplateListResult> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 25)));

  const conds: SQL[] = [];
  if (params.clinicId) conds.push(eq(schema.diet.clinicId, params.clinicId));
  if (params.origin === "system") conds.push(isNotNull(schema.diet.sourceKey));
  if (params.origin === "clinic") conds.push(isNull(schema.diet.sourceKey));
  const term = params.search?.trim();
  if (term) {
    conds.push(
      sql`unaccent(lower(${schema.diet.name})) like '%' || unaccent(lower(${term})) || '%'`,
    );
  }
  const where = conds.length ? and(...conds) : undefined;

  const usage = sql<number>`(select count(*)::int from student_diet sd where sd.source_diet_id = ${schema.diet.id})`;

  const rows = await db
    .select({
      id: schema.diet.id,
      name: schema.diet.name,
      clinicId: schema.diet.clinicId,
      clinicName: schema.clinic.name,
      sourceKey: schema.diet.sourceKey,
      archived: schema.diet.archived,
      updatedAt: schema.diet.updatedAt,
      studentUsageCount: usage,
    })
    .from(schema.diet)
    .innerJoin(schema.clinic, eq(schema.clinic.id, schema.diet.clinicId))
    .where(where)
    .orderBy(asc(schema.clinic.name), asc(schema.diet.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.diet)
    .innerJoin(schema.clinic, eq(schema.clinic.id, schema.diet.clinicId))
    .where(where);

  const items: AdminTemplateRow[] = rows.map(({ clinicId, ...r }) => ({
    ...r,
    clinicId: clinicId as string,
    origin: r.sourceKey === null ? "clinic" : "system",
  }));
  return { items, total, page, pageSize };
}

/** A page of every clinic's workouts (same shape as {@link listDietsAcrossClinics}). */
export async function listWorkoutsAcrossClinics(
  db: DB,
  params: AdminTemplateListParams = {},
): Promise<AdminTemplateListResult> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 25)));

  const conds: SQL[] = [];
  if (params.clinicId) conds.push(eq(schema.workout.clinicId, params.clinicId));
  if (params.origin === "system") conds.push(isNotNull(schema.workout.sourceKey));
  if (params.origin === "clinic") conds.push(isNull(schema.workout.sourceKey));
  const term = params.search?.trim();
  if (term) {
    conds.push(
      sql`unaccent(lower(${schema.workout.name})) like '%' || unaccent(lower(${term})) || '%'`,
    );
  }
  const where = conds.length ? and(...conds) : undefined;

  const usage = sql<number>`(select count(*)::int from student_workout sw where sw.source_workout_id = ${schema.workout.id})`;

  const rows = await db
    .select({
      id: schema.workout.id,
      name: schema.workout.name,
      clinicId: schema.workout.clinicId,
      clinicName: schema.clinic.name,
      sourceKey: schema.workout.sourceKey,
      archived: schema.workout.archived,
      updatedAt: schema.workout.updatedAt,
      studentUsageCount: usage,
    })
    .from(schema.workout)
    .innerJoin(schema.clinic, eq(schema.clinic.id, schema.workout.clinicId))
    .where(where)
    .orderBy(asc(schema.clinic.name), asc(schema.workout.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.workout)
    .innerJoin(schema.clinic, eq(schema.clinic.id, schema.workout.clinicId))
    .where(where);

  const items: AdminTemplateRow[] = rows.map(({ clinicId, ...r }) => ({
    ...r,
    clinicId: clinicId as string,
    origin: r.sourceKey === null ? "clinic" : "system",
  }));
  return { items, total, page, pageSize };
}

/** Hard-deletes any diet (cross-tenant); meals/items cascade. False when unknown. */
export async function hardDeleteDiet(db: DB, id: string): Promise<boolean> {
  const rows = await db
    .delete(schema.diet)
    .where(eq(schema.diet.id, id))
    .returning({ id: schema.diet.id });
  return rows.length > 0;
}

/** Hard-deletes any workout (cross-tenant); sessions/exercises cascade. */
export async function hardDeleteWorkout(db: DB, id: string): Promise<boolean> {
  const rows = await db
    .delete(schema.workout)
    .where(eq(schema.workout.id, id))
    .returning({ id: schema.workout.id });
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
