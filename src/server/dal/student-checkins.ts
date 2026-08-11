import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { schema } from "@/db";
import type { CheckinPose } from "@/db/schema";
import type {
  CheckinDto,
  CheckinListDto,
  WeightPointDto,
} from "@/lib/student-checkins";
import type { TenantContext } from "@/server/tenant";

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
async function ownStudentId(ctx: TenantContext): Promise<string | null> {
  const [row] = await ctx.db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.userId, ctx.userId),
        eq(schema.students.clinicId, ctx.clinicId),
      ),
    );
  return row?.id ?? null;
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
  const studentId = await ownStudentId(ctx);
  if (!studentId) return null;

  const date = todayIsoDate();

  return ctx.db.transaction(async (tx) => {
    const [checkin] = await tx
      .insert(schema.studentCheckin)
      .values({
        clinicId: ctx.clinicId,
        studentId,
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
      createdAt: checkin.createdAt.toISOString(),
    };
  });
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

  // Photo counts per check-in, in one grouped query scoped to these rows.
  const ids = rows.map((r) => r.id);
  const countByCheckin = new Map<string, number>();
  if (ids.length > 0) {
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
    for (const c of counts) countByCheckin.set(c.checkinId, c.count);
  }

  const checkins: CheckinDto[] = rows.map((r) => ({
    id: r.id,
    date: r.date,
    author: r.author,
    weightKg: r.weightKg,
    note: r.note,
    photoCount: countByCheckin.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
  }));

  // Weight series for the chart: entries with a weight, oldest → newest.
  const weightSeries: WeightPointDto[] = checkins
    .filter((c): c is CheckinDto & { weightKg: number } => c.weightKg !== null)
    .map((c) => ({ date: c.date, weightKg: c.weightKg }))
    .reverse();

  return { checkins, weightSeries };
}
