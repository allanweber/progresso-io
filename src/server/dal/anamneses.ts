import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import type { DB } from "@/db";
import { schema } from "@/db";
import {
  countQuestions,
  type AnamnesisModality,
  type AnamnesisObjective,
  type AnamnesisSection,
} from "@/lib/anamneses";
import type { TenantContext } from "@/server/tenant";
import { STARTER_ANAMNESES } from "@/server/anamneses/starter-templates";

/**
 * Anamnesis (anamnese) DAL. An anamnese is a coach-authored intake
 * questionnaire. Unlike diets/workouts there is **no shared base template**:
 * every clinic gets its own copy of a starter set when it is created (see
 * `seedClinicAnamneses`) and owns them outright. Every read/write is scoped to
 * `clinic_id = ctx.clinicId`, so a coach can only ever touch its own clinic's
 * anamneses. The whole questionnaire (sections → questions) is one JSON document
 * on the row — nothing references the catalog, so there is no hydration.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/* -------------------------------------------------------------------------- */
/*  Read types                                                                 */
/* -------------------------------------------------------------------------- */

export type AnamnesisListItem = {
  id: string;
  name: string;
  objective: AnamnesisObjective;
  modality: AnamnesisModality;
  sectionCount: number;
  questionCount: number;
  updatedAt: Date;
};

export type AnamnesisListParams = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export type AnamnesisListResult = {
  items: AnamnesisListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type AnamnesisDetail = {
  id: string;
  name: string;
  description: string | null;
  objective: AnamnesisObjective;
  modality: AnamnesisModality;
  sections: AnamnesisSection[];
  createdAt: Date;
  updatedAt: Date;
};

/* -------------------------------------------------------------------------- */
/*  Write types                                                                */
/* -------------------------------------------------------------------------- */

export type AnamnesisWriteInput = {
  name: string;
  description: string | null;
  objective: AnamnesisObjective;
  modality: AnamnesisModality;
  sections: AnamnesisSection[];
};

export type AnamnesisWriteResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" };

/* -------------------------------------------------------------------------- */
/*  Reads                                                                      */
/* -------------------------------------------------------------------------- */

function listWhere(ctx: TenantContext, params: AnamnesisListParams) {
  const conds = [eq(schema.anamnesis.clinicId, ctx.clinicId)];
  const term = params.search?.trim();
  if (term) {
    for (const token of term.split(/\s+/)) {
      conds.push(
        sql`unaccent(lower(${schema.anamnesis.name})) like '%' || unaccent(lower(${token})) || '%'`,
      );
    }
  }
  return and(...conds);
}

/**
 * A page of this clinic's anamneses (ordered by most recently updated), each
 * with its section/question counts (derived from the stored JSON).
 */
export async function listAnamneses(
  ctx: TenantContext,
  params: AnamnesisListParams = {},
): Promise<AnamnesisListResult> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(params.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const where = listWhere(ctx, params);

  const rows = await ctx.db
    .select({
      id: schema.anamnesis.id,
      name: schema.anamnesis.name,
      objective: schema.anamnesis.objective,
      modality: schema.anamnesis.modality,
      sections: schema.anamnesis.sections,
      updatedAt: schema.anamnesis.updatedAt,
    })
    .from(schema.anamnesis)
    .where(where)
    .orderBy(desc(schema.anamnesis.updatedAt), asc(schema.anamnesis.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await ctx.db
    .select({ total: count() })
    .from(schema.anamnesis)
    .where(where);

  const items: AnamnesisListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    objective: r.objective,
    modality: r.modality,
    sectionCount: r.sections.length,
    questionCount: countQuestions(r.sections),
    updatedAt: r.updatedAt,
  }));

  return { items, total, page, pageSize };
}

/** A single anamnese with its full questionnaire, or null when not this clinic's. */
export async function getAnamnesis(
  ctx: TenantContext,
  id: string,
): Promise<AnamnesisDetail | null> {
  const [row] = await ctx.db
    .select()
    .from(schema.anamnesis)
    .where(
      and(eq(schema.anamnesis.id, id), eq(schema.anamnesis.clinicId, ctx.clinicId)),
    );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    objective: row.objective,
    modality: row.modality,
    sections: row.sections,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/*  Writes (clinic-owned only)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Creates a clinic-owned anamnese. `clinicId`/`coachId` are stamped from the
 * context — never from client input.
 */
export async function createAnamnesis(
  ctx: TenantContext,
  input: AnamnesisWriteInput,
): Promise<{ ok: true; id: string }> {
  const [row] = await ctx.db
    .insert(schema.anamnesis)
    .values({
      clinicId: ctx.clinicId,
      coachId: ctx.userId,
      name: input.name,
      description: input.description,
      objective: input.objective,
      modality: input.modality,
      sections: input.sections,
    })
    .returning({ id: schema.anamnesis.id });
  return { ok: true, id: row.id };
}

/**
 * Updates one of this clinic's anamneses, replacing the whole document. Scoped
 * to `clinic_id = ctx.clinicId`, so another clinic's row is never matched.
 */
export async function updateAnamnesis(
  ctx: TenantContext,
  id: string,
  input: AnamnesisWriteInput,
): Promise<AnamnesisWriteResult> {
  const [row] = await ctx.db
    .update(schema.anamnesis)
    .set({
      name: input.name,
      description: input.description,
      objective: input.objective,
      modality: input.modality,
      sections: input.sections,
      updatedAt: new Date(),
    })
    .where(
      and(eq(schema.anamnesis.id, id), eq(schema.anamnesis.clinicId, ctx.clinicId)),
    )
    .returning({ id: schema.anamnesis.id });
  return row ? { ok: true, id } : { ok: false, reason: "not_found" };
}

/** The " (cópia)" suffix, and the name cap it has to fit inside. */
const COPY_SUFFIX = " (cópia)";
const NAME_MAX = 120;

function copyName(name: string): string {
  const base =
    name.length + COPY_SUFFIX.length > NAME_MAX
      ? name.slice(0, NAME_MAX - COPY_SUFFIX.length).trimEnd()
      : name;
  return `${base}${COPY_SUFFIX}`;
}

/**
 * Creates an exact copy of one of this clinic's anamneses named "<name> (cópia)".
 * Returns `not_found` when the source isn't this clinic's.
 */
export async function copyAnamnesis(
  ctx: TenantContext,
  id: string,
): Promise<AnamnesisWriteResult> {
  const source = await getAnamnesis(ctx, id);
  if (!source) return { ok: false, reason: "not_found" };
  return createAnamnesis(ctx, {
    name: copyName(source.name),
    description: source.description,
    objective: source.objective,
    modality: source.modality,
    sections: source.sections,
  });
}

/**
 * Permanently deletes one of this clinic's anamneses. Scoped to
 * `clinic_id = ctx.clinicId`; returns false when the row isn't this clinic's.
 * Nothing references an anamnese in this phase, so the delete is unconditional.
 */
export async function deleteAnamnesis(
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const rows = await ctx.db
    .delete(schema.anamnesis)
    .where(
      and(eq(schema.anamnesis.id, id), eq(schema.anamnesis.clinicId, ctx.clinicId)),
    )
    .returning({ id: schema.anamnesis.id });
  return rows.length > 0;
}

/* -------------------------------------------------------------------------- */
/*  Bootstrap (no tenant yet — seeds a new clinic's starter set)               */
/* -------------------------------------------------------------------------- */

/**
 * Copies the curated starter anamneses into a newly-created clinic. A bootstrap
 * operation (like `createClinicForOwner`): it runs at clinic creation, before
 * there is a session/`TenantContext`, so it takes a raw DB handle. Idempotent —
 * a clinic that already has anamneses is left untouched, so it is safe to call
 * from the seed against an existing dev clinic.
 */
export async function seedClinicAnamneses(
  db: DB,
  clinicId: string,
  coachId: string | null,
): Promise<number> {
  const [existing] = await db
    .select({ id: schema.anamnesis.id })
    .from(schema.anamnesis)
    .where(eq(schema.anamnesis.clinicId, clinicId))
    .limit(1);
  if (existing) return 0;

  await db.insert(schema.anamnesis).values(
    STARTER_ANAMNESES.map((t) => ({
      clinicId,
      coachId,
      name: t.name,
      description: t.description,
      objective: t.objective,
      modality: t.modality,
      sections: t.sections,
    })),
  );
  return STARTER_ANAMNESES.length;
}
