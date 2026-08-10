import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { AnamnesisSection } from "@/lib/anamneses";
import type {
  AnamnesisAnswers,
  AnamnesisFilledBy,
  StudentAnamnesisDto,
} from "@/lib/student-anamneses";
import type { Student, StudentAnamnesis } from "@/db/schema";
import type { TenantContext } from "@/server/tenant";

/** Serializes a row to the client DTO (Dates → ISO strings). */
export function toStudentAnamnesisDto(
  row: StudentAnamnesis,
): StudentAnamnesisDto {
  return {
    id: row.id,
    studentId: row.studentId,
    sourceAnamnesisId: row.sourceAnamnesisId,
    name: row.name,
    sections: row.sections,
    answers: row.answers,
    status: row.status,
    filledBy: row.filledBy,
    filledAt: row.filledAt ? row.filledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Student-anamnese DAL. A student's anamnese is the **filled** questionnaire on
 * their profile — a frozen snapshot of a clinic template's sections/questions
 * plus the collected answers. Every tenant read/write is scoped to
 * `clinic_id = ctx.clinicId`. The public fill flow (online students) runs
 * without a session — the fill token is the credential — so those helpers take a
 * raw DB handle and are the documented bootstrap exception, like invite-accept.
 */

/** How long a fill link stays valid. */
export const FILL_TTL_DAYS = 30;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

/* -------------------------------------------------------------------------- */
/*  Tenant reads/writes (coach side)                                           */
/* -------------------------------------------------------------------------- */

/** The student's current anamnese, or null when none is assigned yet. */
export async function getStudentAnamnesis(
  ctx: TenantContext,
  studentId: string,
): Promise<StudentAnamnesis | null> {
  const [row] = await ctx.db
    .select()
    .from(schema.studentAnamnesis)
    .where(
      and(
        eq(schema.studentAnamnesis.clinicId, ctx.clinicId),
        eq(schema.studentAnamnesis.studentId, studentId),
      ),
    );
  return row ?? null;
}

export type AssignResult =
  | { ok: true; studentAnamnesis: StudentAnamnesis }
  | { ok: false; reason: "anamnesis_not_found" };

/**
 * Assigns (or replaces) a template on a student: snapshots the template's name +
 * sections onto the student's record, clearing any prior answers/status/token.
 * Both registration and "usar outro template" call this — one current record per
 * student (the unique `student_id` is upserted).
 */
export async function assignAnamnesis(
  ctx: TenantContext,
  studentId: string,
  anamnesisId: string,
): Promise<AssignResult> {
  // Read the template snapshot — scoped to the clinic (its own template only).
  const [template] = await ctx.db
    .select({
      name: schema.anamnesis.name,
      sections: schema.anamnesis.sections,
    })
    .from(schema.anamnesis)
    .where(
      and(
        eq(schema.anamnesis.id, anamnesisId),
        eq(schema.anamnesis.clinicId, ctx.clinicId),
      ),
    );
  if (!template) return { ok: false, reason: "anamnesis_not_found" };

  const values = {
    clinicId: ctx.clinicId,
    studentId,
    sourceAnamnesisId: anamnesisId,
    name: template.name,
    sections: template.sections as AnamnesisSection[],
    answers: {} as AnamnesisAnswers,
    status: "pending" as const,
    filledBy: null,
    filledAt: null,
    fillTokenHash: null,
    fillTokenExpiresAt: null,
    updatedAt: new Date(),
  };

  // Upsert on the one-per-student unique key: a re-assign resets the snapshot.
  const [row] = await ctx.db
    .insert(schema.studentAnamnesis)
    .values(values)
    .onConflictDoUpdate({
      target: schema.studentAnamnesis.studentId,
      set: values,
    })
    .returning();
  return { ok: true, studentAnamnesis: row };
}

/**
 * Saves answers edited/filled by the coach. Completing a still-pending anamnese
 * stamps `filledBy = "coach"`; editing an already-completed one only updates the
 * answers (the original "who filled it" label is preserved). Returns the updated
 * row, or null when the student has no anamnese in this clinic.
 */
export async function saveAnswers(
  ctx: TenantContext,
  studentId: string,
  answers: AnamnesisAnswers,
  by: AnamnesisFilledBy = "coach",
): Promise<StudentAnamnesis | null> {
  const existing = await getStudentAnamnesis(ctx, studentId);
  if (!existing) return null;

  const now = new Date();
  const completing = existing.status !== "completed";
  const [row] = await ctx.db
    .update(schema.studentAnamnesis)
    .set({
      answers,
      updatedAt: now,
      ...(completing
        ? { status: "completed" as const, filledBy: by, filledAt: now }
        : {}),
    })
    .where(
      and(
        eq(schema.studentAnamnesis.clinicId, ctx.clinicId),
        eq(schema.studentAnamnesis.id, existing.id),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * (Re)issues the public fill token for a student's anamnese and returns the raw
 * token (for the WhatsApp link). Supersedes any prior token. Returns null when
 * the student has no anamnese.
 */
export async function issueFillToken(
  ctx: TenantContext,
  studentId: string,
): Promise<string | null> {
  const existing = await getStudentAnamnesis(ctx, studentId);
  if (!existing) return null;
  const { raw, hash } = generateToken();
  const expiresAt = new Date(Date.now() + FILL_TTL_DAYS * 24 * 60 * 60 * 1000);
  await ctx.db
    .update(schema.studentAnamnesis)
    .set({ fillTokenHash: hash, fillTokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(
      and(
        eq(schema.studentAnamnesis.clinicId, ctx.clinicId),
        eq(schema.studentAnamnesis.id, existing.id),
      ),
    );
  return raw;
}

/* -------------------------------------------------------------------------- */
/*  Public fill flow (no session — the token is the credential)                */
/* -------------------------------------------------------------------------- */

export type FillLookup = {
  studentAnamnesis: StudentAnamnesis;
  student: Student;
  clinicName: string;
};

/**
 * Resolves a raw fill token to its still-valid, unsubmitted anamnese, the
 * student it's for, and the clinic name — for the public fill page. Returns null
 * when the token is unknown, expired or already submitted. No tenant context.
 */
export async function findByFillToken(
  db: DB,
  rawToken: string,
): Promise<FillLookup | null> {
  const [row] = await db
    .select({
      studentAnamnesis: schema.studentAnamnesis,
      student: schema.students,
      clinicName: schema.clinic.name,
    })
    .from(schema.studentAnamnesis)
    .innerJoin(
      schema.students,
      eq(schema.students.id, schema.studentAnamnesis.studentId),
    )
    .innerJoin(
      schema.clinic,
      eq(schema.clinic.id, schema.studentAnamnesis.clinicId),
    )
    .where(
      and(
        eq(schema.studentAnamnesis.fillTokenHash, hashToken(rawToken)),
        eq(schema.studentAnamnesis.status, "pending"),
        gt(schema.studentAnamnesis.fillTokenExpiresAt, new Date()),
      ),
    );
  return row ?? null;
}

export type SubmitFillResult = {
  clinicId: string;
  studentId: string;
  studentName: string;
  anamnesisName: string;
};

/**
 * Records an online student's submitted answers: marks the anamnese completed
 * (filled by the aluno), stamps the time, and invalidates the single-use token.
 * Scoped by the id resolved from the token; the `status = pending` guard makes a
 * double-submit a no-op. Returns the data the caller needs to raise the
 * notification, or null when already submitted.
 */
export async function submitFill(
  db: DB,
  studentAnamnesisId: string,
  answers: AnamnesisAnswers,
): Promise<SubmitFillResult | null> {
  const now = new Date();
  const [row] = await db
    .update(schema.studentAnamnesis)
    .set({
      answers,
      status: "completed",
      filledBy: "aluno",
      filledAt: now,
      fillTokenHash: null,
      fillTokenExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.studentAnamnesis.id, studentAnamnesisId),
        eq(schema.studentAnamnesis.status, "pending"),
      ),
    )
    .returning({
      clinicId: schema.studentAnamnesis.clinicId,
      studentId: schema.studentAnamnesis.studentId,
      name: schema.studentAnamnesis.name,
    });
  if (!row) return null;

  const [student] = await db
    .select({
      firstName: schema.students.firstName,
      lastName: schema.students.lastName,
    })
    .from(schema.students)
    .where(eq(schema.students.id, row.studentId));

  return {
    clinicId: row.clinicId,
    studentId: row.studentId,
    studentName: student
      ? `${student.firstName} ${student.lastName}`.trim()
      : "Aluno",
    anamnesisName: row.name,
  };
}
