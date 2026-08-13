// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { addDays, todayYmd } from "@/lib/calendar";
import { calendarEvents, plans, students as studentsDal } from "@/server/dal";
import { CalendarValidationError } from "@/server/dal/calendar-events";
import type { TenantContext } from "@/server/tenant";

import { createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let h: DB;

const password = "supersegura123";

/** Signs a coach up (bootstraps their clinic) and returns a tenant context. */
async function ownerContext(
  email: string,
  plan: schema.Plan,
): Promise<TenantContext> {
  await auth.api.signUpEmail({ body: { name: "Owner", email, password } });
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email));
  await db
    .update(schema.clinic)
    .set({ plan })
    .where(eq(schema.clinic.id, user.clinicId!));
  return { db: h, clinicId: user.clinicId!, userId: user.id, role: "coach" };
}

/** A range wide enough to contain any derived marker regardless of "today". */
const WIDE_RANGE = {
  from: addDays(todayYmd(), -400),
  to: addDays(todayYmd(), 400),
};

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });
});

describe("calendar plan gate", () => {
  it("excludes Free and includes the paid plans", async () => {
    const free = await ownerContext("cal-free@example.com", "free");
    const solo = await ownerContext("cal-solo@example.com", "solo");
    expect(await plans.canUseCalendar(free)).toBe(false);
    expect(await plans.canUseCalendar(solo)).toBe(true);
  });
});

describe("manual events (CRUD + tenant isolation)", () => {
  it("creates, reads, edits and deletes only within the clinic", async () => {
    const a = await ownerContext("cal-a@example.com", "clinica");
    const b = await ownerContext("cal-b@example.com", "clinica");

    const { id } = await calendarEvents.createEvent(a, {
      type: "presencial",
      title: "Avaliação",
      date: todayYmd(),
      startTime: "09:00",
      endTime: null,
      studentId: null,
      notes: null,
    });

    // Clinic A sees its event; clinic B does not.
    const seenByA = await calendarEvents.getCalendar(a, WIDE_RANGE);
    const seenByB = await calendarEvents.getCalendar(b, WIDE_RANGE);
    expect(seenByA.items.some((i) => i.id === id)).toBe(true);
    expect(seenByB.items.some((i) => i.id === id)).toBe(false);

    // B cannot edit or delete A's event.
    expect(
      await calendarEvents.updateEvent(b, id, {
        type: "admin",
        title: "hack",
        date: todayYmd(),
        startTime: null,
        endTime: null,
        studentId: null,
        notes: null,
      }),
    ).toBeNull();
    expect(await calendarEvents.deleteEvent(b, id)).toBe(false);

    // A can edit then delete it.
    const updated = await calendarEvents.updateEvent(a, id, {
      type: "admin",
      title: "Renovação",
      date: todayYmd(),
      startTime: null,
      endTime: null,
      studentId: null,
      notes: "ok",
    });
    expect(updated?.id).toBe(id);
    expect(await calendarEvents.deleteEvent(a, id)).toBe(true);

    const afterDelete = await calendarEvents.getCalendar(a, WIDE_RANGE);
    expect(afterDelete.items.some((i) => i.id === id)).toBe(false);
  });

  it("rejects linking a student from another clinic", async () => {
    const a = await ownerContext("cal-a2@example.com", "clinica");
    const b = await ownerContext("cal-b2@example.com", "clinica");
    const bStudent = await studentsDal.createStudent(b, {
      firstName: "Aluno",
      lastName: "B",
      email: "aluno-b@example.com",
    });

    await expect(
      calendarEvents.createEvent(a, {
        type: "presencial",
        title: "cross-tenant",
        date: todayYmd(),
        startTime: null,
        endTime: null,
        studentId: bStudent.id,
        notes: null,
      }),
    ).rejects.toBeInstanceOf(CalendarValidationError);
  });
});

describe("derived check-in markers", () => {
  it("projects a next-due marker for each active student", async () => {
    const ctx = await ownerContext("cal-derived@example.com", "clinica");
    const student = await studentsDal.createStudent(ctx, {
      firstName: "Mariana",
      lastName: "Silva",
      email: "mariana@example.com",
    });

    const calendar = await calendarEvents.getCalendar(ctx, WIDE_RANGE);
    const marker = calendar.items.find(
      (i) => i.source === "checkin-due" && i.studentId === student.id,
    );
    expect(marker).toBeTruthy();
    expect(marker?.id).toBeNull(); // read-only, not a stored row
    expect(marker?.type).toBe("checkin");
  });

  it("flags a long-overdue student's marker as overdue", async () => {
    const ctx = await ownerContext("cal-overdue@example.com", "clinica");
    const student = await studentsDal.createStudent(ctx, {
      firstName: "Atrasado",
      lastName: "Aluno",
      email: "atrasado@example.com",
    });
    // A check-in months ago → the next due date is in the past → overdue.
    await db.insert(schema.studentCheckin).values({
      clinicId: ctx.clinicId,
      studentId: student.id,
      date: addDays(todayYmd(), -120),
      author: "student",
      weightKg: 80,
    });

    const calendar = await calendarEvents.getCalendar(ctx, WIDE_RANGE);
    const marker = calendar.items.find(
      (i) => i.source === "checkin-due" && i.studentId === student.id,
    );
    expect(marker?.overdue).toBe(true);
  });

  it("does not project markers for archived students", async () => {
    const ctx = await ownerContext("cal-archived@example.com", "clinica");
    const student = await studentsDal.createStudent(ctx, {
      firstName: "Arquivado",
      lastName: "Aluno",
      email: "arquivado@example.com",
    });
    await db
      .update(schema.students)
      .set({ status: "archived" })
      .where(eq(schema.students.id, student.id));

    const calendar = await calendarEvents.getCalendar(ctx, WIDE_RANGE);
    expect(
      calendar.items.some(
        (i) => i.source === "checkin-due" && i.studentId === student.id,
      ),
    ).toBe(false);
  });
});
