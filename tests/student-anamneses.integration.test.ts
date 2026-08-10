// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { AnamnesisSection } from "@/lib/anamneses";
import type { TenantContext } from "@/server/tenant";
import { studentAnamneses } from "@/server/dal";

import { createTestDb, type TestDb } from "./pglite";

/**
 * The student-anamnese DAL: assigning a template snapshots it onto the student,
 * answers are collected in place, the online fill flow is gated by a single-use
 * token, and everything is tenant-scoped. The snapshot must NOT change when the
 * source template is later edited.
 */

let db: TestDb;
let ctxA: TenantContext;
let ctxB: TenantContext;
let studentA: string;
let studentB: string;
let templateA: string;

const SECTIONS: AnamnesisSection[] = [
  {
    key: "perfil",
    title: "Perfil",
    questions: [
      { key: "idade", type: "short_text", label: "Idade" },
      { key: "peso_atual", type: "short_text", label: "Peso atual" },
      { key: "fuma", type: "boolean", label: "Fuma?" },
    ],
  },
];

function ctxFor(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "coach" };
}

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(schema.user).values([
    { id: "user-a", name: "Coach A", email: "a@example.com" },
    { id: "user-b", name: "Coach B", email: "b@example.com" },
  ]);
  const [clinicA] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic A", ownerUserId: "user-a" })
    .returning();
  const [clinicB] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic B", ownerUserId: "user-b" })
    .returning();
  ctxA = ctxFor(clinicA.id, "user-a");
  ctxB = ctxFor(clinicB.id, "user-b");

  const [sa] = await db
    .insert(schema.students)
    .values({ clinicId: clinicA.id, firstName: "Ana", lastName: "Aluna", phone: "5511999990000" })
    .returning();
  studentA = sa.id;
  const [sb] = await db
    .insert(schema.students)
    .values({ clinicId: clinicB.id, firstName: "Bia", lastName: "Beta", phone: "5511888880000" })
    .returning();
  studentB = sb.id;

  const [tpl] = await db
    .insert(schema.anamnesis)
    .values({
      clinicId: clinicA.id,
      coachId: "user-a",
      name: "Anamnese base",
      objective: "hypertrophy",
      modality: "online",
      sections: SECTIONS,
    })
    .returning();
  templateA = tpl.id;
});

describe("student-anamnese DAL", () => {
  it("snapshots the template on assign and stays frozen when the template changes", async () => {
    const res = await studentAnamneses.assignAnamnesis(ctxA, studentA, templateA);
    expect(res.ok).toBe(true);

    const row = await studentAnamneses.getStudentAnamnesis(ctxA, studentA);
    expect(row).not.toBeNull();
    expect(row!.name).toBe("Anamnese base");
    expect(row!.status).toBe("pending");
    expect(row!.sections[0].questions).toHaveLength(3);

    // Editing the source template does not mutate the student's snapshot.
    await db
      .update(schema.anamnesis)
      .set({ name: "Renomeada", sections: [] })
      .where(eq(schema.anamnesis.id, templateA));
    const after = await studentAnamneses.getStudentAnamnesis(ctxA, studentA);
    expect(after!.name).toBe("Anamnese base");
    expect(after!.sections[0].questions).toHaveLength(3);

    // Another clinic can't read it.
    expect(await studentAnamneses.getStudentAnamnesis(ctxB, studentA)).toBeNull();
  });

  it("coach fills answers (completed by coach) and re-edits keep the label", async () => {
    const saved = await studentAnamneses.saveAnswers(
      ctxA,
      studentA,
      { idade: "29", fuma: false },
      "coach",
    );
    expect(saved!.status).toBe("completed");
    expect(saved!.filledBy).toBe("coach");

    // Editing again keeps who first filled it.
    const again = await studentAnamneses.saveAnswers(ctxA, studentA, { idade: "30" }, "coach");
    expect(again!.filledBy).toBe("coach");
    expect(again!.answers.idade).toBe("30");
  });

  it("online fill: token resolves once, submit completes + invalidates it", async () => {
    // Re-assign to reset to pending (clears answers/token).
    await studentAnamneses.assignAnamnesis(ctxA, studentA, templateA);
    const raw = await studentAnamneses.issueFillToken(ctxA, studentA);
    expect(raw).toBeTruthy();

    const found = await studentAnamneses.findByFillToken(db as unknown as DB, raw!);
    expect(found).not.toBeNull();
    expect(found!.student.firstName).toBe("Ana");
    expect(found!.clinicName).toBe("Clinic A");

    const result = await studentAnamneses.submitFill(db as unknown as DB, found!.studentAnamnesis.id, {
      idade: "29",
      fuma: true,
    });
    expect(result).not.toBeNull();
    expect(result!.studentName).toBe("Ana Aluna");

    const row = await studentAnamneses.getStudentAnamnesis(ctxA, studentA);
    expect(row!.status).toBe("completed");
    expect(row!.filledBy).toBe("aluno");

    // The token is single-use: it no longer resolves, and a re-submit is a no-op.
    expect(await studentAnamneses.findByFillToken(db as unknown as DB, raw!)).toBeNull();
    expect(
      await studentAnamneses.submitFill(db as unknown as DB, row!.id, { idade: "x" }),
    ).toBeNull();
  });

  it("an unknown token never resolves", async () => {
    expect(await studentAnamneses.findByFillToken(db as unknown as DB, "nope")).toBeNull();
  });

  it("replacing the template resets to pending and clears answers", async () => {
    // studentA currently completed; replace the template.
    const res = await studentAnamneses.assignAnamnesis(ctxA, studentA, templateA);
    expect(res.ok).toBe(true);
    const row = await studentAnamneses.getStudentAnamnesis(ctxA, studentA);
    expect(row!.status).toBe("pending");
    expect(row!.filledBy).toBeNull();
    expect(Object.keys(row!.answers)).toHaveLength(0);
  });

  it("won't assign another clinic's template", async () => {
    const res = await studentAnamneses.assignAnamnesis(ctxB, studentB, templateA);
    expect(res).toEqual({ ok: false, reason: "anamnesis_not_found" });
  });
});
