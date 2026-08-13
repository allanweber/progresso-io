import { and, eq, gte, isNotNull, lte, max } from "drizzle-orm";

import { schema } from "@/db";
import {
  computeCheckinDue,
  todayYmd,
  type CalendarDto,
  type CalendarEventInput,
  type CalendarItemDto,
  type CalendarStudentOption,
} from "@/lib/calendar";
import type { TenantContext } from "@/server/tenant";

/**
 * Calendar / Agenda access. Clinic-scoped (every coach in the clinic sees all
 * events — attribution only, never access control). Two data sources are merged
 * on read:
 *
 *  1. Stored `calendar_event` rows — the ad-hoc events a coach types in.
 *  2. Derived, read-only "próximo check-in" markers — one per ACTIVE student,
 *     computed live from the clinic's cadence (`feedbackFrequency` +
 *     `feedbackPreferredDay`) and the student's last check-in. Never stored, so
 *     they roll forward automatically as check-ins arrive.
 *
 * Every query filters by `ctx.clinicId`; the caller derives that from the
 * session, never from client input. The plan gate (`canUseCalendar`) is enforced
 * one layer up, in the route handler.
 */

/** A domain error the route maps to a friendly per-field message. */
export class CalendarValidationError extends Error {
  constructor(readonly code: "invalid_student") {
    super(code);
    this.name = "CalendarValidationError";
  }
}

/** Orders items within the merged list: by day, all-day first, then time/title. */
function compareItems(a: CalendarItemDto, b: CalendarItemDto): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const at = a.startTime ?? "";
  const bt = b.startTime ?? "";
  if (at !== bt) return at < bt ? -1 : 1;
  return a.title.localeCompare(b.title, "pt-BR");
}

/** Confirms an optional student belongs to this clinic before linking it. */
async function assertStudentInClinic(
  ctx: TenantContext,
  studentId: string,
): Promise<void> {
  const [row] = await ctx.db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.id, studentId),
        eq(schema.students.clinicId, ctx.clinicId),
      ),
    );
  if (!row) throw new CalendarValidationError("invalid_student");
}

/**
 * The calendar for a date range `[from, to]` (inclusive, `YYYY-MM-DD`): stored
 * events in range + derived check-in markers landing in range, plus the active
 * students available to link in the event form.
 */
export async function getCalendar(
  ctx: TenantContext,
  range: { from: string; to: string },
): Promise<CalendarDto> {
  const { from, to } = range;

  // 1. Stored events in range (with the linked student's name, if any).
  const eventRows = await ctx.db
    .select({
      id: schema.calendarEvent.id,
      type: schema.calendarEvent.type,
      title: schema.calendarEvent.title,
      date: schema.calendarEvent.date,
      startTime: schema.calendarEvent.startTime,
      endTime: schema.calendarEvent.endTime,
      notes: schema.calendarEvent.notes,
      studentId: schema.calendarEvent.studentId,
      studentFirst: schema.students.firstName,
      studentLast: schema.students.lastName,
    })
    .from(schema.calendarEvent)
    .leftJoin(
      schema.students,
      eq(schema.students.id, schema.calendarEvent.studentId),
    )
    .where(
      and(
        eq(schema.calendarEvent.clinicId, ctx.clinicId),
        gte(schema.calendarEvent.date, from),
        lte(schema.calendarEvent.date, to),
      ),
    );

  const manual: CalendarItemDto[] = eventRows.map((r) => ({
    key: r.id,
    id: r.id,
    source: "manual",
    type: r.type,
    title: r.title,
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    notes: r.notes,
    studentId: r.studentId,
    studentName:
      r.studentFirst && r.studentLast
        ? `${r.studentFirst} ${r.studentLast}`
        : null,
    overdue: false,
  }));

  // 2. Derived check-in markers, from the clinic cadence + active students.
  const [clinicRow] = await ctx.db
    .select({ frequency: schema.clinic.feedbackFrequency })
    .from(schema.clinic)
    .where(eq(schema.clinic.id, ctx.clinicId));

  const activeStudents = await ctx.db
    .select({
      id: schema.students.id,
      firstName: schema.students.firstName,
      lastName: schema.students.lastName,
      createdAt: schema.students.createdAt,
    })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.clinicId, ctx.clinicId),
        eq(schema.students.status, "active"),
      ),
    );

  const lastCheckins = await ctx.db
    .select({
      studentId: schema.studentCheckin.studentId,
      last: max(schema.studentCheckin.date),
    })
    .from(schema.studentCheckin)
    .where(eq(schema.studentCheckin.clinicId, ctx.clinicId))
    .groupBy(schema.studentCheckin.studentId);
  const lastByStudent = new Map(lastCheckins.map((r) => [r.studentId, r.last]));

  const today = todayYmd();
  const frequency = clinicRow?.frequency ?? "semanal";

  // A student whose upcoming check-in the coach has already MATERIALIZED (a
  // stored `checkin` event dated today or later) no longer gets a derived
  // marker — the manual record takes over, so the two never double up. See the
  // "materialize on edit/drag" flow in the calendar page.
  const materializedRows = await ctx.db
    .select({ studentId: schema.calendarEvent.studentId })
    .from(schema.calendarEvent)
    .where(
      and(
        eq(schema.calendarEvent.clinicId, ctx.clinicId),
        eq(schema.calendarEvent.type, "checkin"),
        gte(schema.calendarEvent.date, today),
        isNotNull(schema.calendarEvent.studentId),
      ),
    );
  const materialized = new Set(
    materializedRows.map((r) => r.studentId).filter((id): id is string => !!id),
  );

  const derived: CalendarItemDto[] = [];
  for (const s of activeStudents) {
    if (materialized.has(s.id)) continue;
    const due = computeCheckinDue({
      today,
      lastCheckinDate: lastByStudent.get(s.id) ?? null,
      createdDate: todayYmd(s.createdAt),
      frequency,
    });
    if (due.date < from || due.date > to) continue;
    derived.push({
      key: `checkin:${s.id}`,
      id: null,
      source: "checkin-due",
      type: "checkin",
      title: `Check-in — ${s.firstName}`,
      date: due.date,
      startTime: null,
      endTime: null,
      notes: null,
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`,
      overdue: due.overdue,
    });
  }

  const students: CalendarStudentOption[] = activeStudents
    .map((s) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName, "pt-BR"));

  const items = [...manual, ...derived].sort(compareItems);
  return { from, to, items, students };
}

/**
 * Creates a manual calendar event. `clinicId`/`coachId`/`createdBy` are stamped
 * from the session; an optional `studentId` is validated to be in this clinic.
 */
export async function createEvent(
  ctx: TenantContext,
  input: CalendarEventInput,
): Promise<{ id: string }> {
  if (input.studentId) await assertStudentInClinic(ctx, input.studentId);

  const [row] = await ctx.db
    .insert(schema.calendarEvent)
    .values({
      clinicId: ctx.clinicId,
      studentId: input.studentId ?? null,
      coachId: ctx.userId,
      type: input.type,
      title: input.title,
      date: input.date,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      notes: input.notes ?? null,
      createdByUserId: ctx.userId,
    })
    .returning({ id: schema.calendarEvent.id });

  return { id: row.id };
}

/**
 * Edits a manual event in this clinic. Returns the event id on success, or
 * `null` when no such event exists here (404). Derived markers have no id and
 * can't reach this path.
 */
export async function updateEvent(
  ctx: TenantContext,
  id: string,
  input: CalendarEventInput,
): Promise<{ id: string } | null> {
  if (input.studentId) await assertStudentInClinic(ctx, input.studentId);

  const [row] = await ctx.db
    .update(schema.calendarEvent)
    .set({
      studentId: input.studentId ?? null,
      type: input.type,
      title: input.title,
      date: input.date,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      notes: input.notes ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.calendarEvent.id, id),
        eq(schema.calendarEvent.clinicId, ctx.clinicId),
      ),
    )
    .returning({ id: schema.calendarEvent.id });

  return row ? { id: row.id } : null;
}

/** Deletes a manual event in this clinic. Returns whether a row was removed. */
export async function deleteEvent(
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const rows = await ctx.db
    .delete(schema.calendarEvent)
    .where(
      and(
        eq(schema.calendarEvent.id, id),
        eq(schema.calendarEvent.clinicId, ctx.clinicId),
      ),
    )
    .returning({ id: schema.calendarEvent.id });
  return rows.length > 0;
}
