import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { schema } from "@/db";
import type { CheckinAuthor, CheckinPose } from "@/db/schema";
import type { CheckinAssessmentDto } from "@/lib/checkin-assessment";
import type {
  CheckinDetailDto,
  CheckinDto,
  CheckinListDto,
  WeightPointDto,
} from "@/lib/student-checkins";
import type { TenantContext } from "@/server/tenant";

import { createNotification } from "./notifications";

/** Maps a `checkin_assessment` row to its DTO (only measured sites present). */
export function toAssessmentDto(row: {
  assessedAt: string;
  circumferences: CheckinAssessmentDto["circumferences"];
  skinfolds: CheckinAssessmentDto["skinfolds"];
  bodyFatPct: number | null;
}): CheckinAssessmentDto {
  return {
    assessedAt: row.assessedAt,
    circumferences: row.circumferences ?? {},
    skinfolds: row.skinfolds ?? {},
    bodyFatPct: row.bodyFatPct,
  };
}

/**
 * Aluno check-in DAL. Doubly scoped: by `ctx.clinicId` (the tenant) AND by the
 * student row owned by the authenticated user. The aluno never supplies a
 * `studentId` — it is resolved here from the session — so it is impossible to
 * write or read another student's check-ins.
 *
 * Unlike student-portal.ts (read-only), this module also WRITES: the aluno logs
 * their own check-ins (author = "student"). A coach in-person entry
 * (author = "coach") would be written by a future coach-side DAL; the reads here
 * already surface both authors on the timeline.
 */

/** Server-side "today" as `YYYY-MM-DD`. */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The student row owned by the authenticated aluno, within their clinic. */
async function ownStudent(
  ctx: TenantContext,
): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const [row] = await ctx.db
    .select({
      id: schema.students.id,
      firstName: schema.students.firstName,
      lastName: schema.students.lastName,
    })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.userId, ctx.userId),
        eq(schema.students.clinicId, ctx.clinicId),
      ),
    );
  return row ?? null;
}

/** The id of the student row owned by the authenticated aluno. */
async function ownStudentId(ctx: TenantContext): Promise<string | null> {
  return (await ownStudent(ctx))?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Shared read helpers (reused by the coach DAL)                             */
/* -------------------------------------------------------------------------- */

/** Photo counts per check-in id, clinic-scoped, in one grouped query. */
export async function photoCountsByCheckin(
  ctx: TenantContext,
  ids: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const counts = await ctx.db
    .select({
      checkinId: schema.studentCheckinPhoto.checkinId,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.studentCheckinPhoto)
    .where(
      and(
        eq(schema.studentCheckinPhoto.clinicId, ctx.clinicId),
        inArray(schema.studentCheckinPhoto.checkinId, ids),
      ),
    )
    .groupBy(schema.studentCheckinPhoto.checkinId);
  for (const c of counts) map.set(c.checkinId, c.count);
  return map;
}

/** The set of check-in ids (of these) that carry an assessment, clinic-scoped. */
export async function assessmentIds(
  ctx: TenantContext,
  ids: string[],
): Promise<Set<string>> {
  const set = new Set<string>();
  if (ids.length === 0) return set;
  const rows = await ctx.db
    .select({ checkinId: schema.checkinAssessment.checkinId })
    .from(schema.checkinAssessment)
    .where(
      and(
        eq(schema.checkinAssessment.clinicId, ctx.clinicId),
        inArray(schema.checkinAssessment.checkinId, ids),
      ),
    );
  for (const r of rows) set.add(r.checkinId);
  return set;
}

/** A raw timeline row as selected from `student_checkin`. */
export type CheckinRow = {
  id: string;
  date: string;
  author: CheckinAuthor;
  weightKg: number | null;
  note: string | null;
  feedback: string | null;
  feedbackAt: Date | null;
  createdAt: Date;
};

/** Maps timeline rows + photo counts + assessment presence → {@link CheckinDto}s. */
export function mapCheckinRows(
  rows: CheckinRow[],
  photoCounts: Map<string, number>,
  assessments: Set<string>,
): CheckinDto[] {
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    author: r.author,
    weightKg: r.weightKg,
    note: r.note,
    photoCount: photoCounts.get(r.id) ?? 0,
    feedback: r.feedback,
    feedbackAt: r.feedbackAt ? r.feedbackAt.toISOString() : null,
    hasAssessment: assessments.has(r.id),
    createdAt: r.createdAt.toISOString(),
  }));
}

export type CheckinPhotoInput = { pose: CheckinPose; r2Key: string };

export type CreateCheckinInput = {
  weightKg: number;
  note: string | null;
  photos: CheckinPhotoInput[];
};

/**
 * Creates the authenticated aluno's check-in for today (author = "student"):
 * inserts the check-in and its photos in one transaction. Returns the new
 * {@link CheckinDto}, or null when the caller isn't a linked aluno (the route
 * then answers 403).
 */
export async function createStudentCheckin(
  ctx: TenantContext,
  input: CreateCheckinInput,
): Promise<CheckinDto | null> {
  const student = await ownStudent(ctx);
  if (!student) return null;

  const date = todayIsoDate();

  const dto = await ctx.db.transaction(async (tx) => {
    const [checkin] = await tx
      .insert(schema.studentCheckin)
      .values({
        clinicId: ctx.clinicId,
        studentId: student.id,
        date,
        author: "student",
        authorUserId: ctx.userId,
        weightKg: input.weightKg,
        note: input.note,
      })
      .returning();

    if (input.photos.length > 0) {
      await tx.insert(schema.studentCheckinPhoto).values(
        input.photos.map((p, i) => ({
          clinicId: ctx.clinicId,
          checkinId: checkin.id,
          pose: p.pose,
          r2Key: p.r2Key,
          sortOrder: i,
        })),
      );
    }

    return {
      id: checkin.id,
      date: checkin.date,
      author: checkin.author,
      weightKg: checkin.weightKg,
      note: checkin.note,
      photoCount: input.photos.length,
      feedback: null,
      feedbackAt: null,
      hasAssessment: false,
      createdAt: checkin.createdAt.toISOString(),
    } satisfies CheckinDto;
  });

  // Notify the clinic's coaches (bell) that a check-in is waiting for review.
  await createNotification(ctx.db, {
    clinicId: ctx.clinicId,
    type: "checkin_submitted",
    data: {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      checkinDate: date,
    },
  });

  return dto;
}

/**
 * The authenticated aluno's whole check-in timeline (newest first, both
 * authors) plus the weight series (oldest → newest) for the evolution chart.
 * Returns null only when the user isn't a linked aluno; an aluno with no
 * check-ins yet gets `{ checkins: [], weightSeries: [] }`.
 */
export async function listMyCheckins(
  ctx: TenantContext,
): Promise<CheckinListDto | null> {
  const studentId = await ownStudentId(ctx);
  if (!studentId) return null;

  const rows = await ctx.db
    .select({
      id: schema.studentCheckin.id,
      date: schema.studentCheckin.date,
      author: schema.studentCheckin.author,
      weightKg: schema.studentCheckin.weightKg,
      note: schema.studentCheckin.note,
      feedback: schema.studentCheckin.feedback,
      feedbackAt: schema.studentCheckin.feedbackAt,
      createdAt: schema.studentCheckin.createdAt,
    })
    .from(schema.studentCheckin)
    .where(
      and(
        eq(schema.studentCheckin.clinicId, ctx.clinicId),
        eq(schema.studentCheckin.studentId, studentId),
      ),
    )
    .orderBy(
      desc(schema.studentCheckin.date),
      desc(schema.studentCheckin.createdAt),
    );

  const ids = rows.map((r) => r.id);
  const checkins: CheckinDto[] = mapCheckinRows(
    rows,
    await photoCountsByCheckin(ctx, ids),
    await assessmentIds(ctx, ids),
  );

  // Weight series for the chart: entries with a weight, oldest → newest.
  const weightSeries: WeightPointDto[] = checkins
    .filter((c): c is CheckinDto & { weightKg: number } => c.weightKg !== null)
    .map((c) => ({ date: c.date, weightKg: c.weightKg }))
    .reverse();

  return { checkins, weightSeries };
}

/**
 * One check-in's full detail (its photos included), for the history modal.
 * Scoped to the aluno's own student; returns null when not found/allowed. Photo
 * keys are NOT exposed — the client resolves bytes by photo id through the
 * owner-scoped photo route.
 */
export async function getMyCheckin(
  ctx: TenantContext,
  checkinId: string,
): Promise<CheckinDetailDto | null> {
  const studentId = await ownStudentId(ctx);
  if (!studentId) return null;

  const [row] = await ctx.db
    .select({
      id: schema.studentCheckin.id,
      date: schema.studentCheckin.date,
      author: schema.studentCheckin.author,
      weightKg: schema.studentCheckin.weightKg,
      note: schema.studentCheckin.note,
      feedback: schema.studentCheckin.feedback,
      feedbackAt: schema.studentCheckin.feedbackAt,
    })
    .from(schema.studentCheckin)
    .where(
      and(
        eq(schema.studentCheckin.id, checkinId),
        eq(schema.studentCheckin.clinicId, ctx.clinicId),
        eq(schema.studentCheckin.studentId, studentId),
      ),
    );
  if (!row) return null;

  const photos = await ctx.db
    .select({
      id: schema.studentCheckinPhoto.id,
      pose: schema.studentCheckinPhoto.pose,
    })
    .from(schema.studentCheckinPhoto)
    .where(
      and(
        eq(schema.studentCheckinPhoto.checkinId, checkinId),
        eq(schema.studentCheckinPhoto.clinicId, ctx.clinicId),
      ),
    )
    .orderBy(schema.studentCheckinPhoto.sortOrder);

  const [assessment] = await ctx.db
    .select({
      assessedAt: schema.checkinAssessment.assessedAt,
      circumferences: schema.checkinAssessment.circumferences,
      skinfolds: schema.checkinAssessment.skinfolds,
      bodyFatPct: schema.checkinAssessment.bodyFatPct,
    })
    .from(schema.checkinAssessment)
    .where(
      and(
        eq(schema.checkinAssessment.checkinId, checkinId),
        eq(schema.checkinAssessment.clinicId, ctx.clinicId),
      ),
    );

  return {
    id: row.id,
    date: row.date,
    author: row.author,
    weightKg: row.weightKg,
    note: row.note,
    feedback: row.feedback,
    feedbackAt: row.feedbackAt ? row.feedbackAt.toISOString() : null,
    photos,
    assessment: assessment ? toAssessmentDto(assessment) : null,
  } satisfies CheckinDetailDto;
}

/**
 * One photo's stored key + pose, scoped to the aluno's own check-in (the join
 * enforces ownership: photo → check-in → this student in this clinic). Null when
 * not found/allowed. The route streams the bytes for this key.
 */
export async function getMyCheckinPhoto(
  ctx: TenantContext,
  checkinId: string,
  photoId: string,
): Promise<{ r2Key: string; pose: CheckinPose } | null> {
  const studentId = await ownStudentId(ctx);
  if (!studentId) return null;

  const [row] = await ctx.db
    .select({
      r2Key: schema.studentCheckinPhoto.r2Key,
      pose: schema.studentCheckinPhoto.pose,
    })
    .from(schema.studentCheckinPhoto)
    .innerJoin(
      schema.studentCheckin,
      eq(schema.studentCheckinPhoto.checkinId, schema.studentCheckin.id),
    )
    .where(
      and(
        eq(schema.studentCheckinPhoto.id, photoId),
        eq(schema.studentCheckinPhoto.checkinId, checkinId),
        eq(schema.studentCheckin.clinicId, ctx.clinicId),
        eq(schema.studentCheckin.studentId, studentId),
      ),
    );
  return row ?? null;
}
