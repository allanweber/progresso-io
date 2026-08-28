import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { schema } from "@/db";
import type { CheckinPose } from "@/db/schema";
import type {
  CheckinCircumferences,
  CheckinSkinfolds,
} from "@/lib/checkin-assessment";
import type {
  AssessmentPointDto,
  CheckinDetailDto,
  CheckinDto,
  CheckinListDto,
  EvolutionDto,
  PhotoSetDto,
  WeightPointDto,
} from "@/lib/student-checkins";
import type { TenantContext } from "@/server/tenant";

import {
  assessmentIds,
  type CheckinPhotoInput,
  mapCheckinRows,
  photoCountsByCheckin,
  planSnapshotColumns,
  resolvePlanSnapshot,
  toAssessmentDto,
  toPlanRefs,
} from "./student-checkins";

/**
 * Coach-side check-in DAL. Every function is scoped by `ctx.clinicId` AND a
 * `studentId` the coach passes — but that id is only trusted after
 * {@link studentInClinic} confirms the student belongs to this clinic, so a
 * coach can never read or write another clinic's check-ins. Unlike the aluno DAL
 * (their own timeline), this is the coach's window onto ANY student in their
 * clinic: review a submission, respond with feedback, record an assessment, or
 * log an in-person check-in.
 */

/** Whether `studentId` is a student of the coach's clinic (gates every call). */
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

/** A pruned assessment ready to persist (only measured sites), or null. */
export type AssessmentWriteInput = {
  circumferences: CheckinCircumferences;
  skinfolds: CheckinSkinfolds;
  bodyFatPct: number | null;
} | null;

/** Inserts or replaces the one assessment of a check-in (unique per check-in). */
async function upsertAssessment(
  ctx: TenantContext,
  args: {
    checkinId: string;
    studentId: string;
    assessedAt: string;
    assessment: AssessmentWriteInput;
  },
): Promise<void> {
  const { assessment } = args;
  if (!assessment) return;
  await ctx.db
    .insert(schema.checkinAssessment)
    .values({
      clinicId: ctx.clinicId,
      checkinId: args.checkinId,
      studentId: args.studentId,
      assessedAt: args.assessedAt,
      circumferences: assessment.circumferences,
      skinfolds: assessment.skinfolds,
      bodyFatPct: assessment.bodyFatPct,
      recordedByUserId: ctx.userId,
    })
    .onConflictDoUpdate({
      target: schema.checkinAssessment.checkinId,
      set: {
        assessedAt: args.assessedAt,
        circumferences: assessment.circumferences,
        skinfolds: assessment.skinfolds,
        bodyFatPct: assessment.bodyFatPct,
        recordedByUserId: ctx.userId,
      },
    });
}

/**
 * A student's whole check-in timeline (newest first, both authors) + the weight
 * series for the chart. Returns null when the student isn't in this clinic.
 */
export async function listStudentCheckins(
  ctx: TenantContext,
  studentId: string,
): Promise<CheckinListDto | null> {
  if (!(await studentInClinic(ctx, studentId))) return null;

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

  const weightSeries: WeightPointDto[] = checkins
    .filter((c): c is CheckinDto & { weightKg: number } => c.weightKg !== null)
    .map((c) => ({ date: c.date, weightKg: c.weightKg }))
    .reverse();

  return { checkins, weightSeries };
}

/** One check-in's detail (photos + assessment), scoped to clinic + student. */
export async function getStudentCheckin(
  ctx: TenantContext,
  studentId: string,
  checkinId: string,
): Promise<CheckinDetailDto | null> {
  const [row] = await ctx.db
    .select({
      id: schema.studentCheckin.id,
      date: schema.studentCheckin.date,
      author: schema.studentCheckin.author,
      weightKg: schema.studentCheckin.weightKg,
      note: schema.studentCheckin.note,
      feedback: schema.studentCheckin.feedback,
      feedbackAt: schema.studentCheckin.feedbackAt,
      ...planSnapshotColumns,
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
    ...toPlanRefs(row),
  } satisfies CheckinDetailDto;
}

/**
 * One photo's stored key + pose, scoped to clinic + student (the join proves the
 * photo belongs to a check-in of this student in this clinic). Null otherwise.
 */
export async function getStudentCheckinPhoto(
  ctx: TenantContext,
  studentId: string,
  checkinId: string,
  photoId: string,
): Promise<{ r2Key: string; pose: CheckinPose } | null> {
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

export type CreateCoachCheckinInput = {
  /**
   * Calendar date of the entry, `YYYY-MM-DD`. Today for a live in-person
   * check-in; a past date when the coach is importing history. Validated (never
   * in the future) at the route's zod layer.
   */
  date: string;
  weightKg: number | null;
  note: string | null;
  photos: CheckinPhotoInput[];
  assessment: AssessmentWriteInput;
};

/**
 * Logs an in-person (coach-authored) check-in for a student: weight + note +
 * optional photos + optional assessment, on `input.date` — today for a live
 * entry, or a past date when importing the history a coach kept elsewhere. The
 * assessment is dated with it, and the plan snapshot resolves against it, so an
 * imported entry reads exactly as it would have on the day. Returns the new
 * {@link CheckinDto}, or null when the student isn't in this clinic.
 */
export async function createCoachCheckin(
  ctx: TenantContext,
  studentId: string,
  input: CreateCoachCheckinInput,
): Promise<CheckinDto | null> {
  if (!(await studentInClinic(ctx, studentId))) return null;

  const date = input.date;
  const snapshot = await resolvePlanSnapshot(ctx, studentId, date);

  return ctx.db.transaction(async (tx) => {
    const txCtx: TenantContext = { ...ctx, db: tx as unknown as typeof ctx.db };

    const [checkin] = await tx
      .insert(schema.studentCheckin)
      .values({
        clinicId: ctx.clinicId,
        studentId,
        date,
        author: "coach",
        authorUserId: ctx.userId,
        weightKg: input.weightKg,
        note: input.note,
        ...snapshot,
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

    await upsertAssessment(txCtx, {
      checkinId: checkin.id,
      studentId,
      assessedAt: date,
      assessment: input.assessment,
    });

    return {
      id: checkin.id,
      date: checkin.date,
      author: checkin.author,
      weightKg: checkin.weightKg,
      note: checkin.note,
      photoCount: input.photos.length,
      feedback: null,
      feedbackAt: null,
      hasAssessment: input.assessment !== null,
      createdAt: checkin.createdAt.toISOString(),
    } satisfies CheckinDto;
  });
}

export type SubmitFeedbackInput = {
  feedback: string;
  assessment: AssessmentWriteInput;
};

/**
 * Records the coach's feedback on a check-in (stamps `feedback`, `feedbackAt`,
 * `feedbackByUserId` — clearing the pending state) and optionally attaches/
 * replaces its body assessment. Scoped to clinic + student. Returns the updated
 * detail, or null when the check-in isn't found in this clinic for this student.
 */
export async function submitFeedback(
  ctx: TenantContext,
  studentId: string,
  checkinId: string,
  input: SubmitFeedbackInput,
): Promise<CheckinDetailDto | null> {
  // Prove the check-in belongs to this student in this clinic before writing.
  const [target] = await ctx.db
    .select({ id: schema.studentCheckin.id, date: schema.studentCheckin.date })
    .from(schema.studentCheckin)
    .where(
      and(
        eq(schema.studentCheckin.id, checkinId),
        eq(schema.studentCheckin.clinicId, ctx.clinicId),
        eq(schema.studentCheckin.studentId, studentId),
      ),
    );
  if (!target) return null;

  await ctx.db.transaction(async (tx) => {
    const txCtx: TenantContext = { ...ctx, db: tx as unknown as typeof ctx.db };
    await tx
      .update(schema.studentCheckin)
      .set({
        feedback: input.feedback,
        feedbackAt: new Date(),
        feedbackByUserId: ctx.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.studentCheckin.id, checkinId),
          eq(schema.studentCheckin.clinicId, ctx.clinicId),
        ),
      );
    await upsertAssessment(txCtx, {
      checkinId,
      studentId,
      assessedAt: target.date,
      assessment: input.assessment,
    });
  });

  return getStudentCheckin(ctx, studentId, checkinId);
}

/**
 * Permanently deletes one check-in of a student in this clinic — either author's
 * — and reports the photo keys whose bytes the caller must now remove. Returns
 * null when the check-in isn't in this clinic for this student.
 *
 * Irreversible on purpose: there is no archive for a check-in, and the entry a
 * coach needs to remove is usually a duplicate, a wrong-student submission or a
 * botched import. The assessment and photo ROWS cascade with it (see the FKs in
 * the schema); the photo BYTES are deleted by the caller after this returns,
 * never inside the transaction — storage is not transactional, and a hiccup
 * there must not roll back a delete the coach was told succeeded.
 *
 * One consequence worth knowing: the student's next check-in date derives from
 * `MAX(date)`, so deleting the most recent entry moves their due date (agenda +
 * WhatsApp reminder) back to the one before it.
 */
export async function deleteCheckin(
  ctx: TenantContext,
  studentId: string,
  checkinId: string,
): Promise<string[] | null> {
  // Prove the check-in belongs to this student in this clinic before deleting.
  const [target] = await ctx.db
    .select({ id: schema.studentCheckin.id })
    .from(schema.studentCheckin)
    .where(
      and(
        eq(schema.studentCheckin.id, checkinId),
        eq(schema.studentCheckin.clinicId, ctx.clinicId),
        eq(schema.studentCheckin.studentId, studentId),
      ),
    );
  if (!target) return null;

  // Read the keys BEFORE the delete cascades the photo rows away.
  const photos = await ctx.db
    .select({ r2Key: schema.studentCheckinPhoto.r2Key })
    .from(schema.studentCheckinPhoto)
    .where(
      and(
        eq(schema.studentCheckinPhoto.checkinId, checkinId),
        eq(schema.studentCheckinPhoto.clinicId, ctx.clinicId),
      ),
    );

  await ctx.db
    .delete(schema.studentCheckin)
    .where(
      and(
        eq(schema.studentCheckin.id, checkinId),
        eq(schema.studentCheckin.clinicId, ctx.clinicId),
      ),
    );

  return photos.map((p) => p.r2Key);
}

/**
 * The measures-over-time data for the coach Evolução tab: the weight series, the
 * assessments (chronological, for the Medidas Δ table) and the check-ins that
 * carry photos (for the comparable before/after). Null when the student isn't in
 * this clinic.
 */
export async function getStudentEvolution(
  ctx: TenantContext,
  studentId: string,
): Promise<EvolutionDto | null> {
  if (!(await studentInClinic(ctx, studentId))) return null;

  const checkins = await ctx.db
    .select({
      id: schema.studentCheckin.id,
      date: schema.studentCheckin.date,
      weightKg: schema.studentCheckin.weightKg,
      createdAt: schema.studentCheckin.createdAt,
    })
    .from(schema.studentCheckin)
    .where(
      and(
        eq(schema.studentCheckin.clinicId, ctx.clinicId),
        eq(schema.studentCheckin.studentId, studentId),
      ),
    )
    .orderBy(asc(schema.studentCheckin.date), asc(schema.studentCheckin.createdAt));

  const weightSeries: WeightPointDto[] = checkins
    .filter((c): c is (typeof checkins)[number] & { weightKg: number } =>
      c.weightKg !== null,
    )
    .map((c) => ({ date: c.date, weightKg: c.weightKg }));

  // Assessments, oldest → newest.
  const assessmentRows = await ctx.db
    .select({
      checkinId: schema.checkinAssessment.checkinId,
      assessedAt: schema.checkinAssessment.assessedAt,
      circumferences: schema.checkinAssessment.circumferences,
      skinfolds: schema.checkinAssessment.skinfolds,
      bodyFatPct: schema.checkinAssessment.bodyFatPct,
    })
    .from(schema.checkinAssessment)
    .where(
      and(
        eq(schema.checkinAssessment.clinicId, ctx.clinicId),
        eq(schema.checkinAssessment.studentId, studentId),
      ),
    )
    .orderBy(asc(schema.checkinAssessment.assessedAt));
  const assessments: AssessmentPointDto[] = assessmentRows.map((r) => ({
    checkinId: r.checkinId,
    date: r.assessedAt,
    circumferences: r.circumferences ?? {},
    skinfolds: r.skinfolds ?? {},
    bodyFatPct: r.bodyFatPct,
  }));

  // Check-ins with photos, oldest → newest (for the comparison).
  const ids = checkins.map((c) => c.id);
  const photoSets: PhotoSetDto[] = [];
  if (ids.length > 0) {
    const photoRows = await ctx.db
      .select({
        id: schema.studentCheckinPhoto.id,
        pose: schema.studentCheckinPhoto.pose,
        checkinId: schema.studentCheckinPhoto.checkinId,
        sortOrder: schema.studentCheckinPhoto.sortOrder,
      })
      .from(schema.studentCheckinPhoto)
      .where(
        and(
          eq(schema.studentCheckinPhoto.clinicId, ctx.clinicId),
          inArray(schema.studentCheckinPhoto.checkinId, ids),
        ),
      )
      .orderBy(asc(schema.studentCheckinPhoto.sortOrder));
    const byCheckin = new Map<string, { id: string; pose: CheckinPose }[]>();
    for (const p of photoRows) {
      if (!byCheckin.has(p.checkinId)) byCheckin.set(p.checkinId, []);
      byCheckin.get(p.checkinId)!.push({ id: p.id, pose: p.pose });
    }
    for (const c of checkins) {
      const photos = byCheckin.get(c.id);
      if (photos && photos.length > 0) {
        photoSets.push({
          checkinId: c.id,
          date: c.date,
          weightKg: c.weightKg,
          photos,
        });
      }
    }
  }

  return { weightSeries, assessments, photoSets };
}
