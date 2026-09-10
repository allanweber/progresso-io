import { and, desc, eq, lt, or } from "drizzle-orm";

import { schema } from "@/db";
import type { CheckinPose, EvaluationStatus, Sex } from "@/db/schema";
import type {
  AiEvaluationDto,
  AiEvaluationPayload,
} from "@/lib/ai-evaluation";
import { derivedMasses } from "@/lib/body-composition";
import type {
  BodyFatSource,
  CheckinCircumferences,
  CheckinSkinfolds,
} from "@/lib/checkin-assessment";
import type { EvaluationConfidence } from "@/db/schema";
import type { TenantContext } from "@/server/tenant";

/**
 * The AI check-in evaluation DAL: the context one evaluation is built from, and
 * the lifecycle of the draft it produces.
 *
 * Every query is scoped by `ctx.clinicId`, and the check-in is resolved through
 * its student — so a `checkinId` belonging to another clinic reads as "not
 * found" rather than as a permission error, which is the same shape the rest of
 * the DAL uses and the one that leaks nothing.
 */

/* -------------------------------------------------------------------------- */
/*  Reads                                                                     */
/* -------------------------------------------------------------------------- */

/** One point on the numeric series the prompt shows as a table. */
export type EvaluationSeriesPoint = {
  date: string;
  weightKg: number | null;
  circumferences: CheckinCircumferences;
  bodyFatPct: number | null;
};

/** A photo to send, identified by pose so the prompt can name what it is. */
export type EvaluationPhoto = { pose: CheckinPose; r2Key: string };

/** One of the coach's own notes, as the prompt shows it. */
export type EvaluationNote = { date: string; body: string };

/**
 * How many of the coach's notes reach the prompt, newest first.
 *
 * Same reasoning as the six-point series: recent context changes the answer and
 * old context does not, while prose is the expensive part of a prompt. Five is
 * about a quarter's worth of notes for a weekly check-in cadence.
 */
const NOTES_LIMIT = 5;

/** How much of one note is sent. A note is a paragraph; anything longer is a document. */
const NOTE_MAX_CHARS = 500;

/**
 * Everything one evaluation reads, in one shape.
 *
 * **The asymmetry between the numbers and the prose is deliberate.** Weight and
 * circumferences come back as a six-point series, because a trend is only
 * visible across several readings and the numbers are nearly free in a prompt.
 * Notes and photos come back for the current check-in and the previous one only,
 * because they are the expensive part and older ones do not change the answer.
 */
export type EvaluationContext = {
  student: {
    id: string;
    name: string;
    goal: string | null;
    sex: Sex | null;
    birthDate: string | null;
  };
  current: {
    id: string;
    date: string;
    weightKg: number | null;
    note: string | null;
    circumferences: CheckinCircumferences;
    skinfolds: CheckinSkinfolds;
    /** What the coach already recorded by hand, if anything. */
    bodyFatPct: number | null;
    photos: EvaluationPhoto[];
  };
  /** The check-in immediately before it, or null on a first-ever check-in. */
  previous: {
    date: string;
    weightKg: number | null;
    note: string | null;
    feedback: string | null;
  } | null;
  /** Oldest → newest, at most six, ending with the current check-in. */
  series: EvaluationSeriesPoint[];
  /**
   * The coach's own notes about this aluno, oldest → newest.
   *
   * **Only the ones the coach wrote themselves.** Notes created by accepting a
   * previous AI evaluation are deliberately excluded: they are largely the
   * model's own prior wording, and feeding those back makes it restate its last
   * conclusion instead of reading this check-in. The history it needs is already
   * in the numbers. What a coach typed by hand — "relatou dormir mal", "desconfio
   * que não está seguindo a dieta" — is the context nothing else carries.
   */
  notes: EvaluationNote[];
};

/** How many readings the numeric series carries. */
const SERIES_LIMIT = 6;

/**
 * Reads the context for one check-in, or null when that check-in is not this
 * clinic's.
 *
 * Ordering matters and is the same rule the timeline uses: `(date desc,
 * createdAt desc)`. Several check-ins can share a date — a coach annotating the
 * day an aluno submitted — so "the previous one" has to be defined by both
 * columns or it flips between reads.
 */
export async function getEvaluationContext(
  ctx: TenantContext,
  checkinId: string,
): Promise<EvaluationContext | null> {
  const [current] = await ctx.db
    .select({
      id: schema.studentCheckin.id,
      studentId: schema.studentCheckin.studentId,
      date: schema.studentCheckin.date,
      createdAt: schema.studentCheckin.createdAt,
      weightKg: schema.studentCheckin.weightKg,
      note: schema.studentCheckin.note,
      firstName: schema.students.firstName,
      lastName: schema.students.lastName,
      goal: schema.students.goal,
      sex: schema.students.sex,
      birthDate: schema.students.birthDate,
    })
    .from(schema.studentCheckin)
    .innerJoin(
      schema.students,
      eq(schema.students.id, schema.studentCheckin.studentId),
    )
    .where(
      and(
        eq(schema.studentCheckin.id, checkinId),
        eq(schema.studentCheckin.clinicId, ctx.clinicId),
      ),
    )
    .limit(1);
  if (!current) return null;

  const [assessment] = await ctx.db
    .select({
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
    )
    .limit(1);

  const photos = await ctx.db
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
    )
    .orderBy(schema.studentCheckinPhoto.sortOrder);

  // Strictly BEFORE the current row on (date, createdAt) — the same tie-break
  // the timeline sorts by, so "previous" means the row directly above it there.
  const olderThanCurrent = or(
    lt(schema.studentCheckin.date, current.date),
    and(
      eq(schema.studentCheckin.date, current.date),
      lt(schema.studentCheckin.createdAt, current.createdAt),
    ),
  );

  const [previous] = await ctx.db
    .select({
      date: schema.studentCheckin.date,
      weightKg: schema.studentCheckin.weightKg,
      note: schema.studentCheckin.note,
      feedback: schema.studentCheckin.feedback,
    })
    .from(schema.studentCheckin)
    .where(
      and(
        eq(schema.studentCheckin.clinicId, ctx.clinicId),
        eq(schema.studentCheckin.studentId, current.studentId),
        olderThanCurrent,
      ),
    )
    .orderBy(desc(schema.studentCheckin.date), desc(schema.studentCheckin.createdAt))
    .limit(1);

  // The series: this check-in and the five before it, newest-first from the
  // database and reversed here so the prompt reads chronologically.
  const recent = await ctx.db
    .select({
      id: schema.studentCheckin.id,
      date: schema.studentCheckin.date,
      weightKg: schema.studentCheckin.weightKg,
      circumferences: schema.checkinAssessment.circumferences,
      bodyFatPct: schema.checkinAssessment.bodyFatPct,
    })
    .from(schema.studentCheckin)
    .leftJoin(
      schema.checkinAssessment,
      eq(schema.checkinAssessment.checkinId, schema.studentCheckin.id),
    )
    .where(
      and(
        eq(schema.studentCheckin.clinicId, ctx.clinicId),
        eq(schema.studentCheckin.studentId, current.studentId),
        or(eq(schema.studentCheckin.id, checkinId), olderThanCurrent),
      ),
    )
    .orderBy(desc(schema.studentCheckin.date), desc(schema.studentCheckin.createdAt))
    .limit(SERIES_LIMIT);

  // Manual notes only — see the field's own comment. Newest first from the
  // database, reversed below so the prompt reads chronologically.
  const noteRows = await ctx.db
    .select({
      body: schema.studentNote.body,
      createdAt: schema.studentNote.createdAt,
    })
    .from(schema.studentNote)
    .where(
      and(
        eq(schema.studentNote.clinicId, ctx.clinicId),
        eq(schema.studentNote.studentId, current.studentId),
        eq(schema.studentNote.source, "manual"),
      ),
    )
    .orderBy(desc(schema.studentNote.createdAt))
    .limit(NOTES_LIMIT);

  return {
    student: {
      id: current.studentId,
      name: `${current.firstName} ${current.lastName}`.trim(),
      goal: current.goal,
      sex: current.sex,
      birthDate: current.birthDate,
    },
    current: {
      id: current.id,
      date: current.date,
      weightKg: current.weightKg,
      note: current.note,
      circumferences: assessment?.circumferences ?? {},
      skinfolds: assessment?.skinfolds ?? {},
      bodyFatPct: assessment?.bodyFatPct ?? null,
      photos,
    },
    previous: previous ?? null,
    series: recent.reverse().map((r) => ({
      date: r.date,
      weightKg: r.weightKg,
      circumferences: r.circumferences ?? {},
      bodyFatPct: r.bodyFatPct,
    })),
    notes: noteRows.reverse().map((n) => ({
      date: n.createdAt.toISOString().slice(0, 10),
      // Truncated rather than dropped: the first paragraph of a long note is
      // still the useful part, and a note nobody capped could be five thousand
      // characters of an unrelated conversation.
      body:
        n.body.length > NOTE_MAX_CHARS
          ? `${n.body.slice(0, NOTE_MAX_CHARS)}…`
          : n.body,
    })),
  };
}

/**
 * Whether a check-in carries anything at all worth reading.
 *
 * The bar is deliberately at the floor: **any one** of a weight, a measurement,
 * a photo or a note is enough. Sparse data is the normal case for an online
 * aluno and is never a refusal — this only catches the genuinely empty row,
 * where charging a credit for a model call over nothing would be indefensible.
 */
export function hasEvaluableData(context: EvaluationContext): boolean {
  const c = context.current;
  return (
    c.weightKg !== null ||
    c.note !== null ||
    c.photos.length > 0 ||
    c.bodyFatPct !== null ||
    Object.keys(c.circumferences).length > 0 ||
    Object.keys(c.skinfolds).length > 0
  );
}

/* -------------------------------------------------------------------------- */
/*  Draft lifecycle                                                           */
/* -------------------------------------------------------------------------- */

/** What the service settled on, after the server had its say on the numbers. */
export type EvaluationWriteInput = {
  checkinId: string;
  studentId: string;
  /**
   * The audit/billing row this came from. Nullable like the column: the service
   * always has one, but a draft is the coach's record and must outlive the
   * generation row rather than depend on it.
   */
  aiGenerationId: string | null;
  payload: AiEvaluationPayload;
  bodyFatPct: number | null;
  bodyFatSource: BodyFatSource | null;
  confidence: EvaluationConfidence | null;
};

/**
 * Writes the draft, replacing whatever was there.
 *
 * Regenerating overwrites rather than accumulating: a coach who asks again has
 * said what they think of the previous answer, and a pile of drafts per check-in
 * is a list nobody would ever read. The `pending` reset matters too — an
 * evaluation that was accepted and then regenerated is pending again, because
 * the numbers on screen are once more undecided.
 */
export async function saveDraft(
  ctx: TenantContext,
  input: EvaluationWriteInput,
): Promise<void> {
  await ctx.db
    .insert(schema.checkinEvaluation)
    .values({
      clinicId: ctx.clinicId,
      checkinId: input.checkinId,
      studentId: input.studentId,
      aiGenerationId: input.aiGenerationId,
      status: "pending",
      payload: input.payload,
      bodyFatPct: input.bodyFatPct,
      bodyFatSource: input.bodyFatSource,
      confidence: input.confidence,
    })
    .onConflictDoUpdate({
      target: schema.checkinEvaluation.checkinId,
      set: {
        aiGenerationId: input.aiGenerationId,
        status: "pending",
        payload: input.payload,
        bodyFatPct: input.bodyFatPct,
        bodyFatSource: input.bodyFatSource,
        confidence: input.confidence,
        decidedByUserId: null,
        decidedAt: null,
        updatedAt: new Date(),
      },
    });
}

/** The stored draft for a check-in, as the coach's screen reads it. */
export async function getEvaluation(
  ctx: TenantContext,
  checkinId: string,
): Promise<AiEvaluationDto | null> {
  const [row] = await ctx.db
    .select({
      id: schema.checkinEvaluation.id,
      checkinId: schema.checkinEvaluation.checkinId,
      status: schema.checkinEvaluation.status,
      payload: schema.checkinEvaluation.payload,
      bodyFatPct: schema.checkinEvaluation.bodyFatPct,
      bodyFatSource: schema.checkinEvaluation.bodyFatSource,
      confidence: schema.checkinEvaluation.confidence,
      createdAt: schema.checkinEvaluation.createdAt,
      weightKg: schema.studentCheckin.weightKg,
    })
    .from(schema.checkinEvaluation)
    .innerJoin(
      schema.studentCheckin,
      eq(schema.studentCheckin.id, schema.checkinEvaluation.checkinId),
    )
    .where(
      and(
        eq(schema.checkinEvaluation.checkinId, checkinId),
        eq(schema.checkinEvaluation.clinicId, ctx.clinicId),
      ),
    )
    .limit(1);
  return row ? toEvaluationDto(row) : null;
}

/**
 * Builds the DTO, **deriving the masses rather than reading them**.
 *
 * They are not columns for the same reason `leanMassPct` is not an editable
 * field: one stored percentage cannot disagree with itself, and two can.
 */
export function toEvaluationDto(row: {
  id: string;
  checkinId: string;
  status: EvaluationStatus;
  payload: AiEvaluationPayload;
  bodyFatPct: number | null;
  bodyFatSource: BodyFatSource | null;
  confidence: EvaluationConfidence | null;
  createdAt: Date;
  weightKg: number | null;
}): AiEvaluationDto {
  const masses = derivedMasses(row.bodyFatPct, row.weightKg);
  return {
    id: row.id,
    checkinId: row.checkinId,
    status: row.status,
    payload: row.payload,
    bodyFatPct: row.bodyFatPct,
    bodyFatSource: row.bodyFatSource,
    confidence: row.confidence,
    ...masses,
    weightKg: row.weightKg,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Marks the draft decided. Returns false when there is nothing pending. */
export async function settleEvaluation(
  ctx: TenantContext,
  checkinId: string,
  status: Extract<EvaluationStatus, "accepted" | "discarded">,
  bodyFatPct?: number | null,
): Promise<boolean> {
  const rows = await ctx.db
    .update(schema.checkinEvaluation)
    .set({
      status,
      // Accepting records the number the coach settled on, which may not be the
      // one the model proposed — that stays intact inside `payload`.
      ...(bodyFatPct === undefined ? {} : { bodyFatPct }),
      decidedByUserId: ctx.userId,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.checkinEvaluation.checkinId, checkinId),
        eq(schema.checkinEvaluation.clinicId, ctx.clinicId),
      ),
    )
    .returning({ id: schema.checkinEvaluation.id });
  return rows.length > 0;
}
