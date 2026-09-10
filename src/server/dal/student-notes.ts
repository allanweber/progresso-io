import { and, desc, eq } from "drizzle-orm";

import { schema } from "@/db";
import type { NoteAcceptance, NoteSource } from "@/db/schema";
import type { AiEvaluationPayload } from "@/lib/ai-evaluation";
import { derivedMasses } from "@/lib/body-composition";
import type { StudentNoteDto } from "@/lib/student-notes";
import type { TenantContext } from "@/server/tenant";

/**
 * Notas do aluno — the coach's own record, and where accepted AI evaluations
 * land.
 *
 * Clinic-scoped like everything else, so colleagues in the same clinic share
 * them. **No function here is reachable from a portal route**: the aluno-facing
 * DAL (`student-portal.ts`, `student-checkins.ts`) does not import this module,
 * and nothing in `/api/student/*` may. That is the whole of the "coach-only"
 * guarantee — it is a routing fact, not a UI convention.
 */

/** Whether a student is this clinic's — every write checks it first. */
async function studentExists(
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
    )
    .limit(1);
  return row !== undefined;
}

/** Everything one note needs, joined to the check-in it is about. */
function selectNotes(
  ctx: TenantContext,
  studentId: string,
  noteId?: string,
) {
  return ctx.db
    .select({
      id: schema.studentNote.id,
      source: schema.studentNote.source,
      body: schema.studentNote.body,
      payload: schema.studentNote.payload,
      acceptance: schema.studentNote.acceptance,
      checkinId: schema.studentNote.checkinId,
      checkinDate: schema.studentCheckin.date,
      checkinWeightKg: schema.studentCheckin.weightKg,
      bodyFatPct: schema.studentNote.bodyFatPct,
      authorName: schema.user.name,
      createdAt: schema.studentNote.createdAt,
      updatedAt: schema.studentNote.updatedAt,
    })
    .from(schema.studentNote)
    // Left joins throughout: a manual note has no check-in, a note whose
    // check-in was deleted has a null FK, and an author who left the clinic is
    // nulled — none of which may drop the note off its own timeline.
    .leftJoin(
      schema.studentCheckin,
      eq(schema.studentCheckin.id, schema.studentNote.checkinId),
    )
    .leftJoin(schema.user, eq(schema.user.id, schema.studentNote.authorUserId))
    .where(
      and(
        eq(schema.studentNote.clinicId, ctx.clinicId),
        eq(schema.studentNote.studentId, studentId),
        // Narrows the same query to one row, so reading back a note just
        // written costs a lookup rather than the whole timeline.
        ...(noteId ? [eq(schema.studentNote.id, noteId)] : []),
      ),
    );
}

type NoteRow = Awaited<ReturnType<typeof selectNotes>>[number];

function toDto(row: NoteRow): StudentNoteDto {
  const { leanMassPct } = derivedMasses(row.bodyFatPct, row.checkinWeightKg);
  return {
    id: row.id,
    source: row.source,
    body: row.body,
    payload: row.payload,
    acceptance: row.acceptance,
    checkinId: row.checkinId,
    checkinDate: row.checkinDate,
    bodyFatPct: row.bodyFatPct,
    leanMassPct,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * A student's notes, newest first — but only if that student is this clinic's.
 *
 * Returns `null` rather than an empty list for an unknown student, so the route
 * can answer 404 instead of implying an empty timeline for someone else's aluno.
 */
export async function listNotes(
  ctx: TenantContext,
  studentId: string,
): Promise<StudentNoteDto[] | null> {
  if (!(await studentExists(ctx, studentId))) return null;

  const rows = await selectNotes(ctx, studentId).orderBy(
    desc(schema.studentNote.createdAt),
  );
  return rows.map(toDto);
}

/** What a write needs beyond the tenant and the student. */
export type NoteWriteInput = {
  studentId: string;
  body: string;
  checkinId: string | null;
  source?: NoteSource;
  payload?: AiEvaluationPayload | null;
  acceptance?: NoteAcceptance | null;
  /** The percentage the coach settled on, when this note records one. */
  bodyFatPct?: number | null;
};

/**
 * Writes a note and returns it as the timeline will render it, or null when the
 * student is not this clinic's.
 *
 * Used by both the manual form and the evaluation accept path — the difference
 * between them is three optional fields, not a second table.
 *
 * It returns the DTO rather than an id so the caller does not have to re-read
 * the whole timeline to render one new row; the read-back is a single-row query
 * on the id it just inserted.
 */
export async function createNote(
  ctx: TenantContext,
  input: NoteWriteInput,
): Promise<StudentNoteDto | null> {
  if (!(await studentExists(ctx, input.studentId))) return null;

  const [inserted] = await ctx.db
    .insert(schema.studentNote)
    .values({
      clinicId: ctx.clinicId,
      studentId: input.studentId,
      checkinId: input.checkinId,
      source: input.source ?? "manual",
      body: input.body,
      payload: input.payload ?? null,
      acceptance: input.acceptance ?? null,
      bodyFatPct: input.bodyFatPct ?? null,
      authorUserId: ctx.userId,
    })
    .returning({ id: schema.studentNote.id });

  return getNote(ctx, input.studentId, inserted.id);
}

/** One note, as the timeline renders it. */
export async function getNote(
  ctx: TenantContext,
  studentId: string,
  noteId: string,
): Promise<StudentNoteDto | null> {
  const [row] = await selectNotes(ctx, studentId, noteId).limit(1);
  return row ? toDto(row) : null;
}

/**
 * Rewrites a note's body. **Only the body** — a note's source, its payload and
 * its check-in are facts about how it came to exist, and editing those would
 * turn an accepted AI evaluation into something that never happened.
 */
export async function updateNote(
  ctx: TenantContext,
  noteId: string,
  body: string,
): Promise<boolean> {
  const rows = await ctx.db
    .update(schema.studentNote)
    .set({ body, updatedAt: new Date() })
    .where(
      and(
        eq(schema.studentNote.id, noteId),
        eq(schema.studentNote.clinicId, ctx.clinicId),
      ),
    )
    .returning({ id: schema.studentNote.id });
  return rows.length > 0;
}

/** Deletes a note — a typo, or one written on the wrong aluno. */
export async function deleteNote(
  ctx: TenantContext,
  noteId: string,
): Promise<boolean> {
  const rows = await ctx.db
    .delete(schema.studentNote)
    .where(
      and(
        eq(schema.studentNote.id, noteId),
        eq(schema.studentNote.clinicId, ctx.clinicId),
      ),
    )
    .returning({ id: schema.studentNote.id });
  return rows.length > 0;
}

/** Whether a check-in belongs to this aluno — validated before it is linked. */
export async function checkinBelongsToStudent(
  ctx: TenantContext,
  studentId: string,
  checkinId: string,
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: schema.studentCheckin.id })
    .from(schema.studentCheckin)
    .where(
      and(
        eq(schema.studentCheckin.id, checkinId),
        eq(schema.studentCheckin.studentId, studentId),
        eq(schema.studentCheckin.clinicId, ctx.clinicId),
      ),
    )
    .limit(1);
  return row !== undefined;
}
