import { and, eq, gte, isNotNull, max } from "drizzle-orm";

import { db, schema, type DB } from "@/db";
import {
  addDays,
  computeCheckinDue,
  FREQUENCY_DAYS,
  todayYmd,
  WEEKDAY_INDEX,
  weekdayOf,
} from "@/lib/calendar";
import type { Weekday } from "@/db/schema";
import { CHECKIN_PERIODO, type TemplateVars } from "@/lib/whatsapp-inbox";
import { plans, whatsapp } from "@/server/dal";
import { logger } from "@/server/observability";
import type { TenantContext } from "@/server/tenant";

/**
 * WhatsApp event automations — the messages a clinic sends on its own behalf,
 * without a person on the other end typing. Two flavors:
 *
 * - **In-request events** (`notifyCheckinFeedback`, `notifyDietPublished`,
 *   `notifyWorkoutPublished`): fired from a coach's API request as a side effect,
 *   using the caller's own ctx. Best-effort — a messaging hiccup must never fail
 *   the coach's action — and plan-gated inside the helper.
 * - **The scheduled reminder** (`runCheckinReminders`): cross-tenant, runs from a
 *   cron with no session; it builds a per-clinic TenantContext (attributed to the
 *   clinic owner) so it can send on each clinic's behalf.
 *
 * All of them go through the same resolver (`sendTemplateToStudent`), so base +
 * clinic templates are honored everywhere. (The portal-access welcome is wired
 * directly in `sendPortalInvite`, which already owns the invite/e-mail flow.)
 */

/**
 * Best-effort in-request send: plan-gated, resolves the student's phone/template
 * internally (via `sendTemplateToStudent`), and never throws — an automation is
 * a side effect of the coach's action, not part of its success. A free clinic
 * (no WhatsApp) is a silent no-op.
 */
async function notifyStudent(
  ctx: TenantContext,
  studentId: string,
  key: string,
  vars: TemplateVars = {},
): Promise<void> {
  try {
    if (!(await plans.canUseWhatsapp(ctx))) return;
    await whatsapp.sendTemplateToStudent(ctx, studentId, key, vars);
  } catch (error) {
    logger.error("whatsapp.event_notify_failed", { err: error, studentId, key });
  }
}

/** Notifies the student their coach answered a check-in (`{link}` → portal). */
export function notifyCheckinFeedback(
  ctx: TenantContext,
  studentId: string,
  portalUrl: string,
): Promise<void> {
  return notifyStudent(ctx, studentId, "checkin_feedback", { link: portalUrl });
}

/** Notifies the student a new diet was published (points them to the portal). */
export function notifyDietPublished(
  ctx: TenantContext,
  studentId: string,
): Promise<void> {
  return notifyStudent(ctx, studentId, "diet_published");
}

/** Notifies the student a new workout was published (points them to the portal). */
export function notifyWorkoutPublished(
  ctx: TenantContext,
  studentId: string,
): Promise<void> {
  return notifyStudent(ctx, studentId, "workout_published");
}

/** The `Weekday` name for a JS weekday index (Sunday = 0). */
function weekdayName(jsIndex: number): Weekday {
  return (Object.keys(WEEKDAY_INDEX) as Weekday[]).find(
    (w) => WEEKDAY_INDEX[w] === jsIndex,
  )!;
}

/**
 * Sends the `checkin_reminder` template to every active student who is due for a
 * check-in, in each clinic whose preferred check-in weekday is `today`.
 *
 * - Fires only for clinics where `today`'s weekday == `feedbackPreferredDay` and
 *   the plan includes WhatsApp.
 * - A student is "due" when their next check-in (`computeCheckinDue`, from their
 *   own history + the clinic cadence) is today or overdue.
 * - Coalesced: a student already reminded within the current cadence period is
 *   skipped (query-based, no extra column), so an overdue student isn't nagged
 *   daily. `{periodo}` comes from the clinic's `feedbackFrequency`.
 *
 * Idempotent within a period; safe to call more than once a day. Meant to be
 * triggered by a daily external cron (see /api/cron/whatsapp-reminders).
 */
export async function runCheckinReminders(
  database: DB = db,
  today: string = todayYmd(),
): Promise<{ clinicsProcessed: number; remindersSent: number }> {
  const todayName = weekdayName(weekdayOf(today));

  const clinics = await database
    .select({
      id: schema.clinic.id,
      ownerUserId: schema.clinic.ownerUserId,
      frequency: schema.clinic.feedbackFrequency,
    })
    .from(schema.clinic)
    .where(eq(schema.clinic.feedbackPreferredDay, todayName));

  let remindersSent = 0;

  for (const clinic of clinics) {
    const ctx: TenantContext = {
      db: database,
      clinicId: clinic.id,
      userId: clinic.ownerUserId,
      role: "coach",
    };
    if (!(await plans.canUseWhatsapp(ctx))) continue;

    const step = FREQUENCY_DAYS[clinic.frequency];
    const periodo = CHECKIN_PERIODO[clinic.frequency];

    const [activeStudents, lastCheckins, remindedRows] = await Promise.all([
      database
        .select({
          id: schema.students.id,
          firstName: schema.students.firstName,
          createdAt: schema.students.createdAt,
        })
        .from(schema.students)
        .where(
          and(
            eq(schema.students.clinicId, clinic.id),
            eq(schema.students.status, "active"),
            isNotNull(schema.students.phone),
          ),
        ),
      database
        .select({
          studentId: schema.studentCheckin.studentId,
          last: max(schema.studentCheckin.date),
        })
        .from(schema.studentCheckin)
        .where(eq(schema.studentCheckin.clinicId, clinic.id))
        .groupBy(schema.studentCheckin.studentId),
      // Students reminded within the current cadence period (dedupe set).
      database
        .select({ studentId: schema.whatsappConversation.studentId })
        .from(schema.whatsappMessage)
        .innerJoin(
          schema.whatsappConversation,
          eq(
            schema.whatsappConversation.id,
            schema.whatsappMessage.conversationId,
          ),
        )
        .where(
          and(
            eq(schema.whatsappMessage.clinicId, clinic.id),
            eq(schema.whatsappMessage.templateKey, "checkin_reminder"),
            gte(
              schema.whatsappMessage.createdAt,
              new Date(`${addDays(today, -(step - 1))}T00:00:00Z`),
            ),
          ),
        ),
    ]);

    const lastByStudent = new Map(
      lastCheckins.map((r) => [r.studentId, r.last]),
    );
    const remindedRecently = new Set(
      remindedRows.map((r) => r.studentId).filter((id): id is string => !!id),
    );

    for (const student of activeStudents) {
      if (remindedRecently.has(student.id)) continue;
      const due = computeCheckinDue({
        today,
        lastCheckinDate: lastByStudent.get(student.id) ?? null,
        createdDate: todayYmd(student.createdAt),
        frequency: clinic.frequency,
      });
      // Remind the due-today and the overdue; skip only students whose next
      // check-in is still upcoming. (`computeCheckinDue` rolls an overdue date
      // FORWARD to the next occurrence, so `date > today` alone isn't "due" —
      // the `overdue` flag is what marks a student who's actually behind.)
      if (!due.overdue && due.date > today) continue;

      const sent = await whatsapp.sendTemplateToStudent(
        ctx,
        student.id,
        "checkin_reminder",
        { nome: student.firstName, periodo },
      );
      if (sent) remindersSent += 1;
    }
  }

  return { clinicsProcessed: clinics.length, remindersSent };
}
