import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { schema } from "@/db";
import type { CheckinPose } from "@/db/schema";
import type {
  CheckinCircumferences,
  CheckinSkinfolds,
} from "@/lib/checkin-assessment";
import type { Modality } from "@/db/schema";
import { CHECKIN_POSE_VALUES } from "@/lib/student-checkins";
import type {
  AssessmentPointDto,
  CheckinDetailDto,
  CheckinDto,
  CheckinListDto,
  CheckinPhotoDto,
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
      modality: schema.studentCheckin.modality,
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
      modality: schema.studentCheckin.modality,
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
    modality: row.modality,
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
  /** How it happened: `in_person` for an assessment, `online` for one relayed. */
  modality: Modality;
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
        modality: input.modality,
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
      modality: checkin.modality,
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

export type UpdateCoachCheckinInput = {
  /** The (possibly corrected) calendar date — never in the future. */
  date: string;
  /** Correctable like the rest — an entry filed presencial by mistake. */
  modality: Modality;
  weightKg: number | null;
  note: string | null;
  /** Photos to add, or to replace whatever holds that pose. */
  photos: CheckinPhotoInput[];
  /** Poses whose photo is dropped entirely. */
  removePoses: CheckinPose[];
  /** The measures to keep. **null clears** any assessment already attached. */
  assessment: AssessmentWriteInput;
};

export type UpdateCoachCheckinResult = {
  detail: CheckinDetailDto;
  /**
   * Keys of photos that are no longer referenced (replaced or removed) — the
   * caller deletes their bytes after the transaction commits, exactly as the
   * check-in delete does.
   */
  orphanedKeys: string[];
};

/**
 * Edits an existing check-in: date, weight, note, measures and photos. Either
 * author's — a coach owns the clinical record, whether the aluno submitted it or
 * the coach logged it.
 *
 * Two things follow the date rather than being edited separately, because
 * letting them drift would quietly corrupt the history:
 *
 * - the **assessment's `assessedAt`**, which is the date the measures were taken;
 * - the **plan snapshot**, re-resolved whenever the date moves, so a check-in
 *   corrected from July to March stops claiming July's diet.
 *
 * A `null` assessment CLEARS the measures (unlike the create path, where null
 * simply means "none supplied") — on an edit, an empty measures form is the
 * coach saying to remove them.
 *
 * Returns the fresh detail plus the orphaned photo keys, or null when the
 * check-in isn't this student's in this clinic.
 */
export async function updateCheckin(
  ctx: TenantContext,
  studentId: string,
  checkinId: string,
  input: UpdateCoachCheckinInput,
): Promise<UpdateCoachCheckinResult | null> {
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

  // Only re-resolve the plan when the date actually moved: the snapshot is
  // meant to be frozen, and re-running it on an unrelated edit would silently
  // repoint an old check-in at a plan published since.
  const snapshot =
    target.date === input.date
      ? null
      : await resolvePlanSnapshot(ctx, studentId, input.date);

  const existing = await ctx.db
    .select({
      pose: schema.studentCheckinPhoto.pose,
      r2Key: schema.studentCheckinPhoto.r2Key,
    })
    .from(schema.studentCheckinPhoto)
    .where(
      and(
        eq(schema.studentCheckinPhoto.checkinId, checkinId),
        eq(schema.studentCheckinPhoto.clinicId, ctx.clinicId),
      ),
    );

  // A pose that is being replaced or dropped loses its current bytes.
  const vacating = new Set<CheckinPose>([
    ...input.removePoses,
    ...input.photos.map((p) => p.pose),
  ]);
  const orphanedKeys = existing
    .filter((p) => vacating.has(p.pose))
    .map((p) => p.r2Key);

  await ctx.db.transaction(async (tx) => {
    const txCtx: TenantContext = { ...ctx, db: tx as unknown as typeof ctx.db };

    await tx
      .update(schema.studentCheckin)
      .set({
        date: input.date,
        modality: input.modality,
        weightKg: input.weightKg,
        note: input.note,
        updatedAt: new Date(),
        ...(snapshot ?? {}),
      })
      .where(
        and(
          eq(schema.studentCheckin.id, checkinId),
          eq(schema.studentCheckin.clinicId, ctx.clinicId),
        ),
      );

    if (vacating.size > 0) {
      await tx
        .delete(schema.studentCheckinPhoto)
        .where(
          and(
            eq(schema.studentCheckinPhoto.checkinId, checkinId),
            eq(schema.studentCheckinPhoto.clinicId, ctx.clinicId),
            inArray(schema.studentCheckinPhoto.pose, [...vacating]),
          ),
        );
    }

    if (input.photos.length > 0) {
      await tx.insert(schema.studentCheckinPhoto).values(
        input.photos.map((p) => ({
          clinicId: ctx.clinicId,
          checkinId,
          pose: p.pose,
          r2Key: p.r2Key,
          sortOrder: poseOrder(p.pose),
        })),
      );
    }

    if (input.assessment) {
      await upsertAssessment(txCtx, {
        checkinId,
        studentId,
        assessedAt: input.date,
        assessment: input.assessment,
      });
    } else {
      await tx
        .delete(schema.checkinAssessment)
        .where(
          and(
            eq(schema.checkinAssessment.checkinId, checkinId),
            eq(schema.checkinAssessment.clinicId, ctx.clinicId),
          ),
        );
    }
  });

  const detail = await getStudentCheckin(ctx, studentId, checkinId);
  if (!detail) return null;
  return { detail, orphanedKeys };
}

/**
 * A pose value no photo can legitimately hold — used for a single statement
 * while two photos trade places. `unique(checkin_id, pose)` is not deferrable,
 * so "A takes B's pose, B takes A's" cannot be done in two updates without
 * colliding halfway; parking A here frees the slot for B first.
 */
const PARKED_POSE = "__swapping__" as CheckinPose;

/** A pose's canonical position in the grid (frente, costas, esquerdo, direito). */
function poseOrder(pose: CheckinPose): number {
  return CHECKIN_POSE_VALUES.indexOf(pose);
}

/** The photos of a check-in, in display order — the shape the detail DTO uses. */
async function checkinPhotos(
  ctx: TenantContext,
  checkinId: string,
): Promise<CheckinPhotoDto[]> {
  return ctx.db
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
}

/**
 * Re-labels one check-in photo as another pose — the fix for the everyday
 * mistake of uploading "lado esquerdo" into the "lado direito" slot. Works for
 * all four, in any combination:
 *
 * - the target pose is **taken** → the two photos trade places (a swap);
 * - the target pose is **free** (an incomplete check-in) → the photo just moves.
 *
 * What changes is the LABEL, never the bytes: each photo keeps its id, so its
 * private stream URL still resolves to the same image and nothing already
 * cached by a browser goes stale. Scoped to clinic + student; returns the
 * check-in's photos in display order, or null when the photo isn't this
 * student's in this clinic.
 */
export async function movePhotoToPose(
  ctx: TenantContext,
  studentId: string,
  checkinId: string,
  photoId: string,
  targetPose: CheckinPose,
): Promise<CheckinPhotoDto[] | null> {
  // The join proves the photo hangs off a check-in of this student, this clinic.
  const [source] = await ctx.db
    .select({
      id: schema.studentCheckinPhoto.id,
      pose: schema.studentCheckinPhoto.pose,
      sortOrder: schema.studentCheckinPhoto.sortOrder,
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
  if (!source) return null;
  if (source.pose === targetPose) return checkinPhotos(ctx, checkinId);

  const [occupant] = await ctx.db
    .select({
      id: schema.studentCheckinPhoto.id,
      sortOrder: schema.studentCheckinPhoto.sortOrder,
    })
    .from(schema.studentCheckinPhoto)
    .where(
      and(
        eq(schema.studentCheckinPhoto.checkinId, checkinId),
        eq(schema.studentCheckinPhoto.clinicId, ctx.clinicId),
        eq(schema.studentCheckinPhoto.pose, targetPose),
      ),
    );

  await ctx.db.transaction(async (tx) => {
    if (!occupant) {
      // Free slot: a plain move, taking the pose's canonical grid position.
      await tx
        .update(schema.studentCheckinPhoto)
        .set({ pose: targetPose, sortOrder: poseOrder(targetPose) })
        .where(eq(schema.studentCheckinPhoto.id, source.id));
      return;
    }
    // Taken: park, hand over, then land — three statements so the unique
    // (checkin, pose) constraint is satisfied after every one of them.
    await tx
      .update(schema.studentCheckinPhoto)
      .set({ pose: PARKED_POSE })
      .where(eq(schema.studentCheckinPhoto.id, source.id));
    await tx
      .update(schema.studentCheckinPhoto)
      .set({ pose: source.pose, sortOrder: source.sortOrder })
      .where(eq(schema.studentCheckinPhoto.id, occupant.id));
    await tx
      .update(schema.studentCheckinPhoto)
      .set({ pose: targetPose, sortOrder: occupant.sortOrder })
      .where(eq(schema.studentCheckinPhoto.id, source.id));
  });

  return checkinPhotos(ctx, checkinId);
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
