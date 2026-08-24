import { eq } from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { Plan } from "@/db/schema";

/**
 * Per-clinic capability limits.
 *
 * Part of the admin DAL: takes a raw {@link DB} handle and is intentionally NOT
 * clinic-scoped. See `./index.ts` for why that exception exists and what gates
 * it.
 */

/** A clinic's plan defaults plus its per-clinic overrides (null = inherit). */
export type ClinicLimitsRow = {
  plan: Plan;
  planMaxStudents: number | null;
  planMaxCoaches: number | null;
  planWhatsapp: boolean | null;
  planArchive: boolean | null;
  planCalendar: boolean | null;
  planAiGenerations: number | null;
  maxStudentsOverride: number | null;
  maxCoachesOverride: number | null;
  whatsappOverride: boolean | null;
  archiveOverride: boolean | null;
  calendarOverride: boolean | null;
  aiGenerationsOverride: number | null;
};

/** Reads a clinic's plan defaults + overrides (left join, so a missing plan row is fine). */
export async function getClinicLimits(
  db: DB,
  clinicId: string,
): Promise<ClinicLimitsRow | null> {
  const [row] = await db
    .select({
      plan: schema.clinic.plan,
      planMaxStudents: schema.planLimit.maxStudents,
      planMaxCoaches: schema.planLimit.maxCoaches,
      planWhatsapp: schema.planLimit.whatsapp,
      planArchive: schema.planLimit.archive,
      planCalendar: schema.planLimit.calendar,
      planAiGenerations: schema.planLimit.aiGenerations,
      maxStudentsOverride: schema.clinic.maxStudentsOverride,
      maxCoachesOverride: schema.clinic.maxCoachesOverride,
      whatsappOverride: schema.clinic.whatsappOverride,
      archiveOverride: schema.clinic.archiveOverride,
      calendarOverride: schema.clinic.calendarOverride,
      aiGenerationsOverride: schema.clinic.aiGenerationsOverride,
    })
    .from(schema.clinic)
    .leftJoin(schema.planLimit, eq(schema.planLimit.plan, schema.clinic.plan))
    .where(eq(schema.clinic.id, clinicId));
  return row ?? null;
}

/** The per-clinic overrides an admin may set (each `null` = inherit the plan). */
export type ClinicLimitsOverrideInput = {
  maxStudentsOverride: number | null;
  maxCoachesOverride: number | null;
  whatsappOverride: boolean | null;
  archiveOverride: boolean | null;
  /** Optional: the input is spread into `.set()`, so omitting it leaves the
   *  stored value alone. The API always sends it; partial callers need not. */
  aiGenerationsOverride?: number | null;
};

/** Writes a clinic's overrides; returns the fresh limits, or null if unknown. */
export async function updateClinicLimits(
  db: DB,
  clinicId: string,
  input: ClinicLimitsOverrideInput,
): Promise<ClinicLimitsRow | null> {
  const rows = await db
    .update(schema.clinic)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(schema.clinic.id, clinicId))
    .returning({ id: schema.clinic.id });
  if (rows.length === 0) return null;
  return getClinicLimits(db, clinicId);
}
