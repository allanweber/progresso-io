// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import type { DB } from "@/db";
import { todayYmd } from "@/lib/calendar";
import {
  coachCheckins,
  studentAnamneses,
  studentCheckins,
  students,
  whatsapp,
} from "@/server/dal";
import { notifyDietPublished } from "@/server/whatsapp-automations";
import type { TenantContext } from "@/server/tenant";

import { createTestDb, type TestDb } from "./pglite";

const PHOTOS = [
  { pose: "frente", r2Key: "f" },
  { pose: "costas", r2Key: "b" },
  { pose: "lado_esquerdo", r2Key: "l" },
  { pose: "lado_direito", r2Key: "r" },
] as const;

const SECTIONS = [
  {
    id: "s1",
    title: "Geral",
    questions: [{ id: "q1", label: "Idade", type: "short_text", required: false }],
  },
];

let db: TestDb;
let h: DB;
let sequence = 0;

async function user(id: string) {
  await db
    .insert(schema.user)
    .values({ id, name: id, email: `${id}@example.com`, emailVerified: true });
}

async function clinic(name: string): Promise<TenantContext> {
  sequence += 1;
  const ownerUserId = `owner-${sequence}`;
  await user(ownerUserId);
  const [row] = await db
    .insert(schema.clinic)
    .values({ name, ownerUserId, plan: "clinica" })
    .returning();
  return { db: h, clinicId: row.id, userId: row.ownerUserId, role: "coach" };
}

async function student(
  ctx: TenantContext,
  modality: "online" | "in_person" = "online",
  userId?: string,
) {
  sequence += 1;
  const [row] = await db
    .insert(schema.students)
    .values({
      clinicId: ctx.clinicId,
      firstName: "Bia",
      lastName: "Souza",
      phone: `55119${String(10000000 + sequence)}`,
      status: "active",
      modality,
      userId,
    })
    .returning({ id: schema.students.id });
  return row.id;
}

async function template(ctx: TenantContext) {
  const [row] = await db
    .insert(schema.anamnesis)
    .values({
      clinicId: ctx.clinicId,
      coachId: ctx.userId,
      name: "Base",
      objective: "hypertrophy",
      modality: "online",
      sections: SECTIONS as never,
    })
    .returning({ id: schema.anamnesis.id });
  return row.id;
}

async function queue(ctx: TenantContext, studentId: string, key: string) {
  const sent = await whatsapp.sendTemplateToStudent(ctx, studentId, key, {
    link: "https://x.io/l",
    periodo: "semanal",
  });
  return sent!.messageId;
}

async function statusOf(id: string) {
  const [row] = await db
    .select({ status: schema.whatsappMessage.status })
    .from(schema.whatsappMessage)
    .where(eq(schema.whatsappMessage.id, id));
  return row.status;
}

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  await db
    .insert(schema.whatsappTemplate)
    .values(
      [
        "anamnesis_welcome",
        "welcome_access",
        "checkin_reminder",
        "checkin_overdue",
        "student_inactive",
        "diet_published",
      ].map((key) => ({
        clinicId: null,
        key,
        title: key,
        body: "{nome}",
        status: "approved" as const,
      })),
    )
    .onConflictDoNothing();
});

beforeEach(() => {
  vi.stubEnv("WHATSAPP_PROVIDER", "handoff");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("offline students", () => {
  it("never get a prepared message, since they have no portal", async () => {
    const ctx = await clinic("Offline");
    const id = await student(ctx, "in_person");

    await notifyDietPublished(ctx, id);

    expect(await whatsapp.sendTemplateToStudent(ctx, id, "checkin_reminder")).toBeNull();
    expect(await whatsapp.listQueued(ctx)).toHaveLength(0);
  });

  it("still get messages the coach writes by hand", async () => {
    const ctx = await clinic("Offline manual");
    const id = await student(ctx, "in_person");
    const online = await student(ctx);
    await queue(ctx, online, "diet_published");
    const [conversation] = await db
      .insert(schema.whatsappConversation)
      .values({ clinicId: ctx.clinicId, studentId: id, phone: "5511977770000" })
      .returning({ id: schema.whatsappConversation.id });

    const message = await whatsapp.sendMessage(ctx, conversation.id, {
      type: "text",
      body: "Oi",
    });

    expect(message?.status).toBe("queued");
  });
});

describe("messages that stopped applying", () => {
  it("withdraws the anamnese request when the student submits it", async () => {
    const ctx = await clinic("Fill");
    const id = await student(ctx);
    await studentAnamneses.assignAnamnesis(ctx, id, await template(ctx));
    const request = await queue(ctx, id, "anamnesis_welcome");
    const unrelated = await queue(ctx, id, "diet_published");
    const row = await studentAnamneses.getStudentAnamnesis(ctx, id);

    await studentAnamneses.submitFill(h, row!.id, { q1: "30" });

    expect(await statusOf(request)).toBe("dismissed");
    expect(await statusOf(unrelated)).toBe("queued");
  });

  it("withdraws the anamnese request when the coach fills it in", async () => {
    const ctx = await clinic("Coach fill");
    const id = await student(ctx);
    await studentAnamneses.assignAnamnesis(ctx, id, await template(ctx));
    const request = await queue(ctx, id, "anamnesis_welcome");

    await studentAnamneses.saveAnswers(ctx, id, { q1: "30" }, "coach");

    expect(await statusOf(request)).toBe("dismissed");
  });

  it("withdraws the old anamnese request when the template changes", async () => {
    const ctx = await clinic("Swap");
    const id = await student(ctx);
    await studentAnamneses.assignAnamnesis(ctx, id, await template(ctx));
    const request = await queue(ctx, id, "anamnesis_welcome");

    await studentAnamneses.assignAnamnesis(ctx, id, await template(ctx));

    expect(await statusOf(request)).toBe("dismissed");
  });

  it("withdraws the portal invite when the student activates", async () => {
    const ctx = await clinic("Accept");
    const id = await student(ctx);
    await user("aluno-accept");
    const invite = await queue(ctx, id, "welcome_access");
    const unrelated = await queue(ctx, id, "diet_published");

    await students.linkStudentAccount(h, {
      clinicId: ctx.clinicId,
      studentId: id,
      userId: "aluno-accept",
    });

    expect(await statusOf(invite)).toBe("dismissed");
    expect(await statusOf(unrelated)).toBe("queued");
  });

  it("withdraws check-in reminders when the student submits a check-in", async () => {
    const ctx = await clinic("Student check-in");
    await user("aluno-checkin");
    const id = await student(ctx, "online", "aluno-checkin");
    const reminder = await queue(ctx, id, "checkin_reminder");
    const overdue = await queue(ctx, id, "checkin_overdue");
    const inactive = await queue(ctx, id, "student_inactive");
    const unrelated = await queue(ctx, id, "diet_published");

    await studentCheckins.createStudentCheckin(
      { ...ctx, userId: "aluno-checkin", role: "aluno" },
      { weightKg: 70, note: null, photos: [...PHOTOS] },
    );

    expect(await statusOf(reminder)).toBe("dismissed");
    expect(await statusOf(overdue)).toBe("dismissed");
    expect(await statusOf(inactive)).toBe("dismissed");
    expect(await statusOf(unrelated)).toBe("queued");
  });

  it("withdraws reminders for a coach check-in today, not a backdated one", async () => {
    const ctx = await clinic("Coach check-in");
    const id = await student(ctx);
    const reminder = await queue(ctx, id, "checkin_reminder");
    const input = {
      modality: "in_person" as const,
      weightKg: 70,
      note: null,
      photos: [],
      assessment: null,
    };

    await coachCheckins.createCoachCheckin(ctx, id, { ...input, date: "2020-01-15" });
    expect(await statusOf(reminder)).toBe("queued");

    await coachCheckins.createCoachCheckin(ctx, id, { ...input, date: todayYmd() });
    expect(await statusOf(reminder)).toBe("dismissed");
  });

  it.each(["archived", "inactive"] as const)(
    "withdraws everything when a student becomes %s",
    async (status) => {
      const ctx = await clinic(`Status ${status}`);
      const id = await student(ctx);
      const diet = await queue(ctx, id, "diet_published");

      await students.setStudentStatus(ctx, id, status);

      expect(await statusOf(diet)).toBe("dismissed");
    },
  );

  it("withdraws everything when a student becomes offline", async () => {
    const ctx = await clinic("To offline");
    const id = await student(ctx);
    const diet = await queue(ctx, id, "diet_published");

    await students.updateStudent(ctx, id, { modality: "in_person" });

    expect(await statusOf(diet)).toBe("dismissed");
  });

  it("withdraws everything when the phone changes, and keeps it otherwise", async () => {
    const ctx = await clinic("Phone");
    const id = await student(ctx);
    const diet = await queue(ctx, id, "diet_published");
    const [current] = await db
      .select({ phone: schema.students.phone })
      .from(schema.students)
      .where(eq(schema.students.id, id));

    await students.updateStudent(ctx, id, { phone: current.phone, firstName: "Ana" });
    expect(await statusOf(diet)).toBe("queued");

    await students.updateStudent(ctx, id, { phone: "5511966660000" });
    expect(await statusOf(diet)).toBe("dismissed");
  });

  it("never touches a message already opened", async () => {
    const ctx = await clinic("Opened");
    const id = await student(ctx);
    const diet = await queue(ctx, id, "diet_published");
    await whatsapp.markHandedOff(ctx, diet);

    await students.setStudentStatus(ctx, id, "archived");

    expect(await statusOf(diet)).toBe("handed_off");
  });

  it("stays inside the clinic", async () => {
    const a = await clinic("Tenant A");
    const b = await clinic("Tenant B");
    const id = await student(a);
    const diet = await queue(a, id, "diet_published");

    await whatsapp.withdrawQueued(b, id);

    expect(await statusOf(diet)).toBe("queued");
  });
});
