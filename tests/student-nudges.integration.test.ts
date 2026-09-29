// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { addDays, daysBetween, todayYmd } from "@/lib/calendar";
import { normalizePhone } from "@/lib/phone";
import type { StudentCheckinInactiveData } from "@/lib/notifications";
import { runStudentInactivityNudges } from "@/server/student-nudges";
import type { TenantContext } from "@/server/tenant";

import { clearTrial, createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let h: DB;

const password = "supersegura123";
const today = todayYmd();

async function ownerContext(
  email: string,
  plan: schema.Plan,
): Promise<TenantContext> {
  await auth.api.signUpEmail({ body: { name: "Coach Owner", email, password } });
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email));
  await db
    .update(schema.clinic)
    .set({ plan })
    .where(eq(schema.clinic.id, user.clinicId!));
  await clearTrial(db, user.clinicId!);
  return { db: h, clinicId: user.clinicId!, userId: user.id, role: "coach" };
}

async function addBaseTemplate(key: string, title: string, body: string) {
  await db
    .insert(schema.whatsappTemplate)
    .values({ clinicId: null, key, title, body, status: "approved" })
    .onConflictDoNothing();
}

let phoneCounter = 0;

async function activeStudent(
  ctx: TenantContext,
  createdAt: string,
): Promise<string> {
  phoneCounter += 1;
  const [student] = await h
    .insert(schema.students)
    .values({
      clinicId: ctx.clinicId,
      firstName: "Aluno",
      lastName: `Teste${phoneCounter}`,
      phone: normalizePhone(`1198888${String(phoneCounter).padStart(4, "0")}`)!,
      status: "active",
      createdAt: new Date(`${createdAt}T00:00:00Z`),
    })
    .returning({ id: schema.students.id });
  return student.id;
}

async function checkinOn(ctx: TenantContext, studentId: string, date: string) {
  await h.insert(schema.studentCheckin).values({
    clinicId: ctx.clinicId,
    studentId,
    date,
    author: "student",
  });
}

async function messagesFor(studentId: string, templateKey: string) {
  return h
    .select({ createdAt: schema.whatsappMessage.createdAt })
    .from(schema.whatsappMessage)
    .innerJoin(
      schema.whatsappConversation,
      eq(schema.whatsappConversation.id, schema.whatsappMessage.conversationId),
    )
    .where(
      and(
        eq(schema.whatsappConversation.studentId, studentId),
        eq(schema.whatsappMessage.templateKey, templateKey),
      ),
    );
}

async function coachAlertsFor(clinicId: string, studentId: string) {
  const rows = await h
    .select({ data: schema.notification.data })
    .from(schema.notification)
    .where(
      and(
        eq(schema.notification.clinicId, clinicId),
        eq(schema.notification.type, "student_checkin_inactive"),
      ),
    );
  return rows.filter(
    (r) => (r.data as StudentCheckinInactiveData).studentId === studentId,
  );
}

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });
  await addBaseTemplate(
    "checkin_overdue",
    "Check-in atrasado",
    "Oi {nome}! Seu check-in {periodo} já passou do prazo.",
  );
  await addBaseTemplate(
    "student_inactive",
    "Aluno inativo",
    "Oi {nome}, faz um tempo que não vejo seu check-in por aqui.",
  );
});

describe("runStudentInactivityNudges — plan gating", () => {
  it("sends nothing at all for a Free clinic, however overdue the student", async () => {
    const ctx = await ownerContext("nudge-free@example.com", "free");
    const studentId = await activeStudent(ctx, addDays(today, -30));

    await runStudentInactivityNudges(h, today);

    expect(await messagesFor(studentId, "checkin_overdue")).toHaveLength(0);
    expect(await messagesFor(studentId, "student_inactive")).toHaveLength(0);
    expect(await coachAlertsFor(ctx.clinicId, studentId)).toHaveLength(0);
  });
});

describe("runStudentInactivityNudges — checkin_overdue", () => {
  it("does not nudge a student still inside the grace period", async () => {
    const ctx = await ownerContext("nudge-grace@example.com", "solo");
    const studentId = await activeStudent(ctx, addDays(today, -8));

    await runStudentInactivityNudges(h, today);

    expect(await messagesFor(studentId, "checkin_overdue")).toHaveLength(0);
  });

  it("nudges a student past the grace period exactly once, even across repeat runs", async () => {
    const ctx = await ownerContext("nudge-overdue@example.com", "solo");
    const studentId = await activeStudent(ctx, addDays(today, -11));

    await runStudentInactivityNudges(h, today);
    await runStudentInactivityNudges(h, today);

    expect(await messagesFor(studentId, "checkin_overdue")).toHaveLength(1);
  });
});

describe("runStudentInactivityNudges — escalation ladder", () => {
  it("escalates checkin_overdue -> student_inactive -> coach alert, one step per run", async () => {
    const ctx = await ownerContext("nudge-escalate@example.com", "solo");
    const studentId = await activeStudent(ctx, addDays(today, -20));

    await runStudentInactivityNudges(h, today);
    expect(await messagesFor(studentId, "checkin_overdue")).toHaveLength(1);
    expect(await messagesFor(studentId, "student_inactive")).toHaveLength(0);
    expect(await coachAlertsFor(ctx.clinicId, studentId)).toHaveLength(0);

    await runStudentInactivityNudges(h, today);
    expect(await messagesFor(studentId, "checkin_overdue")).toHaveLength(1);
    expect(await messagesFor(studentId, "student_inactive")).toHaveLength(1);
    expect(await coachAlertsFor(ctx.clinicId, studentId)).toHaveLength(0);

    await runStudentInactivityNudges(h, today);
    expect(await coachAlertsFor(ctx.clinicId, studentId)).toHaveLength(1);

    await runStudentInactivityNudges(h, today);
    expect(await messagesFor(studentId, "checkin_overdue")).toHaveLength(1);
    expect(await messagesFor(studentId, "student_inactive")).toHaveLength(1);
    expect(await coachAlertsFor(ctx.clinicId, studentId)).toHaveLength(1);
  });
});

describe("runStudentInactivityNudges — episode reset", () => {
  it("clears the escalation once the student checks in, letting a later episode nudge again", async () => {
    const ctx = await ownerContext("nudge-reset@example.com", "solo");
    const studentId = await activeStudent(ctx, addDays(today, -11));

    await runStudentInactivityNudges(h, today);
    expect(await messagesFor(studentId, "checkin_overdue")).toHaveLength(1);

    const checkinDate = addDays(today, 1);
    await checkinOn(ctx, studentId, checkinDate);

    await runStudentInactivityNudges(h, checkinDate);
    expect(await messagesFor(studentId, "checkin_overdue")).toHaveLength(1);

    const muchLater = addDays(checkinDate, 7 + 4);
    expect(daysBetween(addDays(checkinDate, 7), muchLater)).toBeGreaterThanOrEqual(3);
    await runStudentInactivityNudges(h, muchLater);
    expect(await messagesFor(studentId, "checkin_overdue")).toHaveLength(2);
  });
});
