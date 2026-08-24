import {
  and,
  asc,
  count,
  eq,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { AnamnesisModality, AnamnesisObjective } from "@/lib/anamneses";

/**
 * Anamneses (data maintenance — cross-clinic)
 *
 * The admin sees EVERY clinic's anamneses, tagged by provenance
 * (`source_key` non-null ⇒ seeded/imported from the system starter set;
 * null ⇒ coach-authored). Admin can hard-delete any of them, and import the
 * system starters into a chosen clinic (idempotent by `source_key`).
 *
 * Part of the admin DAL: takes a raw {@link DB} handle and is intentionally NOT
 * clinic-scoped. See `./index.ts` for why that exception exists and what gates
 * it.
 */

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
