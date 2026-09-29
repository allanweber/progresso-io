import { and, eq, inArray, isNotNull, max } from "drizzle-orm";

import { db, schema, type DB } from "@/db";
import { addDays, daysBetween, FREQUENCY_DAYS, todayYmd } from "@/lib/calendar";
import type { StudentCheckinInactiveData } from "@/lib/notifications";
import { CHECKIN_PERIODO } from "@/lib/whatsapp-inbox";
import { notifications, plans, whatsapp } from "@/server/dal";
import { logger } from "@/server/observability";
import type { TenantContext } from "@/server/tenant";

const OVERDUE_GRACE_DAYS = 3;
const INACTIVE_DAYS = 14;

export async function runStudentInactivityNudges(
  database: DB = db,
  today: string = todayYmd(),
): Promise<{
  clinicsProcessed: number;
  overdueNudgesSent: number;
  inactiveNudgesSent: number;
  coachAlertsSent: number;
}> {
  const clinics = await database
    .select({
      id: schema.clinic.id,
      ownerUserId: schema.clinic.ownerUserId,
      frequency: schema.clinic.feedbackFrequency,
    })
    .from(schema.clinic);

  let overdueNudgesSent = 0;
  let inactiveNudgesSent = 0;
  let coachAlertsSent = 0;

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

    const [activeStudents, lastCheckins, nudgeMessages, coachAlertRows] =
      await Promise.all([
        database
          .select({
            id: schema.students.id,
            firstName: schema.students.firstName,
            lastName: schema.students.lastName,
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
        database
          .select({
            studentId: schema.whatsappConversation.studentId,
            templateKey: schema.whatsappMessage.templateKey,
            createdAt: schema.whatsappMessage.createdAt,
          })
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
              inArray(schema.whatsappMessage.templateKey, [
                "checkin_overdue",
                "student_inactive",
              ]),
            ),
          ),
        database
          .select({
            data: schema.notification.data,
            createdAt: schema.notification.createdAt,
          })
          .from(schema.notification)
          .where(
            and(
              eq(schema.notification.clinicId, clinic.id),
              eq(schema.notification.type, "student_checkin_inactive"),
            ),
          ),
      ]);

    const lastByStudent = new Map(
      lastCheckins.map((r) => [r.studentId, r.last]),
    );

    const latestSendByStudent = new Map<string, Map<string, Date>>();
    for (const row of nudgeMessages) {
      if (!row.studentId || !row.templateKey) continue;
      const perStudent =
        latestSendByStudent.get(row.studentId) ?? new Map<string, Date>();
      const prev = perStudent.get(row.templateKey);
      if (!prev || row.createdAt > prev) {
        perStudent.set(row.templateKey, row.createdAt);
      }
      latestSendByStudent.set(row.studentId, perStudent);
    }

    const latestCoachAlertByStudent = new Map<string, Date>();
    for (const row of coachAlertRows) {
      const studentId = (row.data as StudentCheckinInactiveData).studentId;
      const prev = latestCoachAlertByStudent.get(studentId);
      if (!prev || row.createdAt > prev) {
        latestCoachAlertByStudent.set(studentId, row.createdAt);
      }
    }

    for (const student of activeStudents) {
      try {
        const lastCheckinDate = lastByStudent.get(student.id) ?? null;
        const anchor = lastCheckinDate
          ? new Date(`${lastCheckinDate}T00:00:00Z`)
          : student.createdAt;
        const base = lastCheckinDate ?? todayYmd(student.createdAt);
        const dueDate = addDays(base, step);
        const daysOverdue = daysBetween(dueDate, today);
        const daysSinceLastCheckin = daysBetween(base, today);

        if (daysOverdue < OVERDUE_GRACE_DAYS) continue;

        const sends = latestSendByStudent.get(student.id);
        const overdueSentAt = sends?.get("checkin_overdue");
        const inactiveSentAt = sends?.get("student_inactive");
        const coachAlertedAt = latestCoachAlertByStudent.get(student.id);
        const overdueSent = !!overdueSentAt && overdueSentAt > anchor;
        const inactiveSent = !!inactiveSentAt && inactiveSentAt > anchor;
        const coachAlerted = !!coachAlertedAt && coachAlertedAt > anchor;

        if (!overdueSent) {
          const sent = await whatsapp.sendTemplateToStudent(
            ctx,
            student.id,
            "checkin_overdue",
            { nome: student.firstName, periodo },
          );
          if (sent) overdueNudgesSent += 1;
        } else if (daysSinceLastCheckin >= INACTIVE_DAYS) {
          if (!inactiveSent) {
            const sent = await whatsapp.sendTemplateToStudent(
              ctx,
              student.id,
              "student_inactive",
              { nome: student.firstName },
            );
            if (sent) inactiveNudgesSent += 1;
          } else if (!coachAlerted) {
            await notifications.createNotification(database, {
              clinicId: clinic.id,
              type: "student_checkin_inactive",
              data: {
                studentId: student.id,
                studentName: `${student.firstName} ${student.lastName}`.trim(),
                daysSinceLastCheckin,
              },
            });
            coachAlertsSent += 1;
          }
        }
      } catch (error) {
        logger.error("student_nudge.failed", { err: error, studentId: student.id });
      }
    }
  }

  return {
    clinicsProcessed: clinics.length,
    overdueNudgesSent,
    inactiveNudgesSent,
    coachAlertsSent,
  };
}
