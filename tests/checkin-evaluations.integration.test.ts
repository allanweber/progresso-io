// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { AiEvaluationPayload } from "@/lib/ai-evaluation";
import { checkinEvaluations, coachCheckins, studentNotes } from "@/server/dal";
import type { TenantContext } from "@/server/tenant";

import { createTestDb, type TestDb } from "./pglite";

/**
 * The AI evaluation and the notes it becomes.
 *
 * What these prove, in order of how badly each would hurt if it broke:
 *
 * 1. **The tenant boundary.** Another clinic's coach cannot read a draft, write
 *    one, or see a note — and gets "not found", not a permission error.
 * 2. **Sparse data is not a refusal, but an empty check-in is.** The whole
 *    online-aluno case depends on the first half of that sentence.
 * 3. **Accepting writes the percentage onto the assessment without touching the
 *    measurements**, and the note keeps the model's original words even after
 *    the coach rewrites the body.
 */

let db: TestDb;
let coachA: TenantContext;
let coachB: TenantContext;
let studentA: string;
let studentB: string;

function ctx(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "coach" };
}

const PAYLOAD: AiEvaluationPayload = {
  bodyFatPct: 21.5,
  confidence: "media",
  unavailable: null,
  verdict: "ajustar",
  summary: "Perda de gordura consistente.",
  evolution: "Cintura caiu 2 cm.",
  diet: "Manter as calorias por duas semanas.",
  workout: "Mais uma série de costas.",
};

/** A check-in on `studentId`, dated so the timeline order is controllable. */
async function makeCheckin(
  clinicId: string,
  studentId: string,
  values: Partial<typeof schema.studentCheckin.$inferInsert> = {},
): Promise<string> {
  const [row] = await db
    .insert(schema.studentCheckin)
    .values({
      clinicId,
      studentId,
      date: "2026-03-01",
      author: "student",
      weightKg: 82.4,
      note: "Semana boa.",
      ...values,
    })
    .returning({ id: schema.studentCheckin.id });
  return row.id;
}

beforeAll(async () => {
  db = await createTestDb();

  await db.insert(schema.user).values([
    { id: "coach-a", name: "Coach A", email: "coach-a@example.com" },
    { id: "coach-b", name: "Coach B", email: "coach-b@example.com" },
  ]);
  const [clinicA] = await db
    .insert(schema.clinic)
    .values({ name: "Studio Forja", ownerUserId: "coach-a" })
    .returning();
  const [clinicB] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic B", ownerUserId: "coach-b" })
    .returning();
  coachA = ctx(clinicA.id, "coach-a");
  coachB = ctx(clinicB.id, "coach-b");

  const [sa] = await db
    .insert(schema.students)
    .values({
      clinicId: clinicA.id,
      coachId: "coach-a",
      firstName: "Ana",
      lastName: "Silva",
      goal: "Emagrecimento",
      sex: "feminino",
      birthDate: "1994-05-20",
    })
    .returning({ id: schema.students.id });
  studentA = sa.id;

  const [sb] = await db
    .insert(schema.students)
    .values({
      clinicId: clinicB.id,
      coachId: "coach-b",
      firstName: "Bruno",
      lastName: "Outro",
    })
    .returning({ id: schema.students.id });
  studentB = sb.id;
});

describe("evaluation context", () => {
  it("reads the aluno, the check-in and its measures in one shape", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA);
    await db.insert(schema.checkinAssessment).values({
      clinicId: coachA.clinicId,
      checkinId,
      studentId: studentA,
      assessedAt: "2026-03-01",
      circumferences: { cintura: 88 },
      skinfolds: { tricipital: 10 },
    });

    const context = await checkinEvaluations.getEvaluationContext(
      coachA,
      checkinId,
    );
    expect(context).not.toBeNull();
    expect(context!.student).toMatchObject({
      name: "Ana Silva",
      goal: "Emagrecimento",
      sex: "feminino",
      birthDate: "1994-05-20",
    });
    expect(context!.current.weightKg).toBe(82.4);
    expect(context!.current.circumferences).toEqual({ cintura: 88 });
    expect(context!.current.skinfolds).toEqual({ tricipital: 10 });
  });

  it("has no previous check-in on the first one — nothing to compare with", async () => {
    const [fresh] = await db
      .insert(schema.students)
      .values({ clinicId: coachA.clinicId, firstName: "Nova", lastName: "Aluna" })
      .returning({ id: schema.students.id });
    const checkinId = await makeCheckin(coachA.clinicId, fresh.id);

    const context = await checkinEvaluations.getEvaluationContext(
      coachA,
      checkinId,
    );
    // The prompt branches on this: a null previous means it is told there is no
    // history, so it cannot invent a trend.
    expect(context!.previous).toBeNull();
    expect(context!.series).toHaveLength(1);
  });

  it("orders history by (date, created_at) so same-day entries do not flip", async () => {
    const [s] = await db
      .insert(schema.students)
      .values({ clinicId: coachA.clinicId, firstName: "Serie", lastName: "Teste" })
      .returning({ id: schema.students.id });

    await makeCheckin(coachA.clinicId, s.id, { date: "2026-01-01", weightKg: 90 });
    await makeCheckin(coachA.clinicId, s.id, { date: "2026-02-01", weightKg: 88 });
    // Two on the same day — a coach annotating the day the aluno submitted.
    await makeCheckin(coachA.clinicId, s.id, { date: "2026-03-01", weightKg: 86 });
    const latest = await makeCheckin(coachA.clinicId, s.id, {
      date: "2026-03-01",
      weightKg: 85,
    });

    const context = await checkinEvaluations.getEvaluationContext(coachA, latest);
    // Oldest → newest, ending with the current one.
    expect(context!.series.map((p) => p.weightKg)).toEqual([90, 88, 86, 85]);
    // "Previous" is the row directly above it on the timeline, same date and all.
    expect(context!.previous).toMatchObject({ date: "2026-03-01", weightKg: 86 });
  });

  it("caps the series at six readings", async () => {
    const [s] = await db
      .insert(schema.students)
      .values({ clinicId: coachA.clinicId, firstName: "Longa", lastName: "Serie" })
      .returning({ id: schema.students.id });
    let last = "";
    for (let i = 1; i <= 9; i++) {
      last = await makeCheckin(coachA.clinicId, s.id, {
        date: `2026-01-0${i}`,
        weightKg: 100 - i,
      });
    }
    const context = await checkinEvaluations.getEvaluationContext(coachA, last);
    expect(context!.series).toHaveLength(6);
    // It ends with the current check-in, whatever it dropped from the far end.
    expect(context!.series[5].weightKg).toBe(91);
  });

  it("is null for another clinic's check-in — not found, not forbidden", async () => {
    const checkinId = await makeCheckin(coachB.clinicId, studentB);
    expect(
      await checkinEvaluations.getEvaluationContext(coachA, checkinId),
    ).toBeNull();
  });
});

describe("the coach's notes as context", () => {
  it("sends the coach's own notes, oldest → newest", async () => {
    const [s] = await db
      .insert(schema.students)
      .values({ clinicId: coachA.clinicId, firstName: "Notas", lastName: "Contexto" })
      .returning({ id: schema.students.id });

    await studentNotes.createNote(coachA, {
      studentId: s.id,
      checkinId: null,
      body: "Relatou dormir mal a semana toda.",
    });
    await studentNotes.createNote(coachA, {
      studentId: s.id,
      checkinId: null,
      body: "Desconfio que não está seguindo a dieta no fim de semana.",
    });

    const checkinId = await makeCheckin(coachA.clinicId, s.id);
    const context = await checkinEvaluations.getEvaluationContext(
      coachA,
      checkinId,
    );
    expect(context!.notes.map((n) => n.body)).toEqual([
      "Relatou dormir mal a semana toda.",
      "Desconfio que não está seguindo a dieta no fim de semana.",
    ]);
  });

  it("excludes notes that came from a previous AI evaluation", async () => {
    const [s] = await db
      .insert(schema.students)
      .values({ clinicId: coachA.clinicId, firstName: "Sem", lastName: "Eco" })
      .returning({ id: schema.students.id });

    await studentNotes.createNote(coachA, {
      studentId: s.id,
      checkinId: null,
      body: "Escrita pelo coach.",
    });
    await studentNotes.createNote(coachA, {
      studentId: s.id,
      checkinId: null,
      source: "ai_evaluation",
      body: "Perda de gordura consistente — texto da IA.",
      payload: PAYLOAD,
      acceptance: "accepted",
    });

    const checkinId = await makeCheckin(coachA.clinicId, s.id);
    const context = await checkinEvaluations.getEvaluationContext(
      coachA,
      checkinId,
    );
    // Feeding the model its own prior wording makes it restate that conclusion
    // instead of reading this check-in. The history is already in the numbers.
    expect(context!.notes.map((n) => n.body)).toEqual(["Escrita pelo coach."]);
  });

  it("keeps the five most recent, not the five oldest", async () => {
    const [s] = await db
      .insert(schema.students)
      .values({ clinicId: coachA.clinicId, firstName: "Muitas", lastName: "Notas" })
      .returning({ id: schema.students.id });

    for (let i = 1; i <= 8; i++) {
      await studentNotes.createNote(coachA, {
        studentId: s.id,
        checkinId: null,
        body: `Nota ${i}`,
      });
    }

    const checkinId = await makeCheckin(coachA.clinicId, s.id);
    const context = await checkinEvaluations.getEvaluationContext(
      coachA,
      checkinId,
    );
    expect(context!.notes).toHaveLength(5);
    expect(context!.notes.map((n) => n.body)).toEqual([
      "Nota 4",
      "Nota 5",
      "Nota 6",
      "Nota 7",
      "Nota 8",
    ]);
  });

  it("truncates a very long note instead of dropping it", async () => {
    const [s] = await db
      .insert(schema.students)
      .values({ clinicId: coachA.clinicId, firstName: "Longa", lastName: "Nota" })
      .returning({ id: schema.students.id });

    await studentNotes.createNote(coachA, {
      studentId: s.id,
      checkinId: null,
      body: "x".repeat(2000),
    });

    const checkinId = await makeCheckin(coachA.clinicId, s.id);
    const context = await checkinEvaluations.getEvaluationContext(
      coachA,
      checkinId,
    );
    // The first paragraph is still the useful part; 2000 characters of it is
    // not, and the prompt pays for every one of them.
    expect(context!.notes[0].body).toHaveLength(501);
    expect(context!.notes[0].body.endsWith("…")).toBe(true);
  });

  it("never carries another clinic's notes into the prompt", async () => {
    const checkinId = await makeCheckin(coachB.clinicId, studentB);
    await studentNotes.createNote(coachB, {
      studentId: studentB,
      checkinId: null,
      body: "Nota da clínica B.",
    });
    // Same student, other clinic's coach: no context at all, because the
    // check-in itself is invisible to them.
    expect(
      await checkinEvaluations.getEvaluationContext(coachA, checkinId),
    ).toBeNull();

    const own = await checkinEvaluations.getEvaluationContext(coachB, checkinId);
    expect(own!.notes.map((n) => n.body)).toEqual(["Nota da clínica B."]);
  });
});

describe("hasEvaluableData", () => {
  it("accepts a check-in with nothing but a weight — the online case", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA, {
      weightKg: 80,
      note: null,
    });
    const context = await checkinEvaluations.getEvaluationContext(
      coachA,
      checkinId,
    );
    // Sparse is the norm for an online aluno, and the advice is the product.
    expect(checkinEvaluations.hasEvaluableData(context!)).toBe(true);
  });

  it("accepts a check-in with nothing but a note", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA, {
      weightKg: null,
      note: "Viajei, treinei em hotel.",
    });
    const context = await checkinEvaluations.getEvaluationContext(
      coachA,
      checkinId,
    );
    expect(checkinEvaluations.hasEvaluableData(context!)).toBe(true);
  });

  it("refuses a genuinely empty one — a credit for a prompt about nothing", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA, {
      weightKg: null,
      note: null,
    });
    const context = await checkinEvaluations.getEvaluationContext(
      coachA,
      checkinId,
    );
    expect(checkinEvaluations.hasEvaluableData(context!)).toBe(false);
  });
});

describe("draft lifecycle", () => {
  it("saves, reads back, and derives the masses from one percentage", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA, {
      weightKg: 80,
    });
    await checkinEvaluations.saveDraft(coachA, {
      checkinId,
      studentId: studentA,
      aiGenerationId: null,
      payload: PAYLOAD,
      bodyFatPct: 20,
      bodyFatSource: "estimate",
      confidence: "media",
    });

    const dto = await checkinEvaluations.getEvaluation(coachA, checkinId);
    expect(dto).toMatchObject({
      status: "pending",
      bodyFatPct: 20,
      bodyFatSource: "estimate",
      confidence: "media",
      // Derived, never stored — so the pair can never drift apart.
      leanMassPct: 80,
      leanMassKg: 64,
      fatMassKg: 16,
      weightKg: 80,
    });
  });

  it("overwrites on regenerate instead of piling up drafts", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA);
    const save = (bodyFatPct: number) =>
      checkinEvaluations.saveDraft(coachA, {
        checkinId,
        studentId: studentA,
        aiGenerationId: null,
        payload: PAYLOAD,
        bodyFatPct,
        bodyFatSource: "estimate",
        confidence: "baixa",
      });
    await save(20);
    await save(24);

    const rows = await db
      .select()
      .from(schema.checkinEvaluation)
      .where(eq(schema.checkinEvaluation.checkinId, checkinId));
    expect(rows).toHaveLength(1);
    expect(rows[0].bodyFatPct).toBe(24);
  });

  it("resets a decided draft to pending when it is regenerated", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA);
    await checkinEvaluations.saveDraft(coachA, {
      checkinId,
      studentId: studentA,
      aiGenerationId: null,
      payload: PAYLOAD,
      bodyFatPct: 20,
      bodyFatSource: "estimate",
      confidence: "baixa",
    });
    await checkinEvaluations.settleEvaluation(coachA, checkinId, "accepted", 19);

    await checkinEvaluations.saveDraft(coachA, {
      checkinId,
      studentId: studentA,
      aiGenerationId: null,
      payload: PAYLOAD,
      bodyFatPct: 22,
      bodyFatSource: "estimate",
      confidence: "alta",
    });
    const dto = await checkinEvaluations.getEvaluation(coachA, checkinId);
    // The numbers on screen are undecided again, so the row has to say so.
    expect(dto!.status).toBe("pending");
    expect(dto!.bodyFatPct).toBe(22);
  });

  it("keeps a discarded draft rather than deleting it", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA);
    await checkinEvaluations.saveDraft(coachA, {
      checkinId,
      studentId: studentA,
      aiGenerationId: null,
      payload: PAYLOAD,
      bodyFatPct: 20,
      bodyFatSource: "estimate",
      confidence: "baixa",
    });
    expect(
      await checkinEvaluations.settleEvaluation(coachA, checkinId, "discarded"),
    ).toBe(true);

    // The credit was spent, and "the coach threw this one away" is the clearest
    // signal there is about whether the feature is any good.
    const dto = await checkinEvaluations.getEvaluation(coachA, checkinId);
    expect(dto!.status).toBe("discarded");
  });

  it("hides another clinic's draft and refuses to settle it", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA);
    await checkinEvaluations.saveDraft(coachA, {
      checkinId,
      studentId: studentA,
      aiGenerationId: null,
      payload: PAYLOAD,
      bodyFatPct: 20,
      bodyFatSource: "estimate",
      confidence: "baixa",
    });
    expect(await checkinEvaluations.getEvaluation(coachB, checkinId)).toBeNull();
    expect(
      await checkinEvaluations.settleEvaluation(coachB, checkinId, "discarded"),
    ).toBe(false);
  });
});

describe("accepting", () => {
  it("writes the percentage onto the assessment without touching the measures", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA);
    await db.insert(schema.checkinAssessment).values({
      clinicId: coachA.clinicId,
      checkinId,
      studentId: studentA,
      assessedAt: "2026-03-01",
      circumferences: { cintura: 88, quadril: 100 },
      skinfolds: { tricipital: 10 },
      protocol: "completa",
    });

    expect(
      await coachCheckins.setAssessmentBodyFat(coachA, studentA, checkinId, {
        bodyFatPct: 19.4,
        bodyFatSource: "estimate",
      }),
    ).toBe(true);

    const [row] = await db
      .select()
      .from(schema.checkinAssessment)
      .where(eq(schema.checkinAssessment.checkinId, checkinId));
    expect(row.bodyFatPct).toBe(19.4);
    expect(row.bodyFatSource).toBe("estimate");
    // The coach measured these. Accepting an evaluation is not a licence to
    // overwrite them.
    expect(row.circumferences).toEqual({ cintura: 88, quadril: 100 });
    expect(row.skinfolds).toEqual({ tricipital: 10 });
    expect(row.protocol).toBe("completa");
  });

  it("creates the assessment when the coach never opened the measures form", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA, {
      date: "2026-04-02",
    });
    await coachCheckins.setAssessmentBodyFat(coachA, studentA, checkinId, {
      bodyFatPct: 22,
      bodyFatSource: "estimate",
    });

    const [row] = await db
      .select()
      .from(schema.checkinAssessment)
      .where(eq(schema.checkinAssessment.checkinId, checkinId));
    expect(row.bodyFatPct).toBe(22);
    // Dated to the check-in it describes — the percentage has to hang off a day.
    expect(row.assessedAt).toBe("2026-04-02");
  });

  it("refuses to write onto another clinic's check-in", async () => {
    const checkinId = await makeCheckin(coachB.clinicId, studentB);
    expect(
      await coachCheckins.setAssessmentBodyFat(coachA, studentB, checkinId, {
        bodyFatPct: 20,
        bodyFatSource: "estimate",
      }),
    ).toBe(false);
  });
});

describe("student notes", () => {
  it("keeps the model's original words even after the coach rewrites the body", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA);
    const note = await studentNotes.createNote(coachA, {
      studentId: studentA,
      checkinId,
      source: "ai_evaluation",
      body: "Texto original da IA.",
      payload: PAYLOAD,
      acceptance: "accepted",
      bodyFatPct: 19.4,
    });
    expect(note).not.toBeNull();

    await studentNotes.updateNote(coachA, note!.id, "Reescrito pelo coach.");
    const after = await studentNotes.getNote(coachA, studentA, note!.id);
    expect(after!.body).toBe("Reescrito pelo coach.");
    // The payload is the only record of what the model actually said.
    expect(after!.payload).toEqual(PAYLOAD);
    expect(after!.acceptance).toBe("accepted");
  });

  it("derives massa magra from the percentage that was accepted", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA, {
      weightKg: 100,
    });
    const note = await studentNotes.createNote(coachA, {
      studentId: studentA,
      checkinId,
      source: "ai_evaluation",
      body: "Nota.",
      payload: PAYLOAD,
      acceptance: "accepted_edited",
      bodyFatPct: 25,
    });
    expect(note).toMatchObject({ bodyFatPct: 25, leanMassPct: 75 });
  });

  it("lists newest first, with manual and AI notes on one timeline", async () => {
    const [s] = await db
      .insert(schema.students)
      .values({ clinicId: coachA.clinicId, firstName: "Time", lastName: "Line" })
      .returning({ id: schema.students.id });

    await studentNotes.createNote(coachA, {
      studentId: s.id,
      checkinId: null,
      body: "Primeira.",
    });
    await studentNotes.createNote(coachA, {
      studentId: s.id,
      checkinId: null,
      source: "ai_evaluation",
      body: "Segunda.",
      payload: PAYLOAD,
      acceptance: "accepted",
    });

    const list = await studentNotes.listNotes(coachA, s.id);
    expect(list!.map((n) => n.body)).toEqual(["Segunda.", "Primeira."]);
    expect(list![0].source).toBe("ai_evaluation");
    expect(list![1].payload).toBeNull();
  });

  it("survives its check-in being deleted", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA);
    const note = await studentNotes.createNote(coachA, {
      studentId: studentA,
      checkinId,
      body: "Sobre um check-in que vai sumir.",
    });
    await db
      .delete(schema.studentCheckin)
      .where(eq(schema.studentCheckin.id, checkinId));

    // `set null`, not cascade: deleting a check-in must not silently delete the
    // coach's conclusions about it.
    const after = await studentNotes.getNote(coachA, studentA, note!.id);
    expect(after).not.toBeNull();
    expect(after!.checkinId).toBeNull();
  });

  it("never shows or touches another clinic's notes", async () => {
    const note = await studentNotes.createNote(coachA, {
      studentId: studentA,
      checkinId: null,
      body: "Confidencial.",
    });

    expect(await studentNotes.listNotes(coachB, studentA)).toBeNull();
    expect(await studentNotes.getNote(coachB, studentA, note!.id)).toBeNull();
    expect(await studentNotes.updateNote(coachB, note!.id, "invadido")).toBe(
      false,
    );
    expect(await studentNotes.deleteNote(coachB, note!.id)).toBe(false);

    // And it is still there, unchanged.
    const [row] = await db
      .select()
      .from(schema.studentNote)
      .where(eq(schema.studentNote.id, note!.id));
    expect(row.body).toBe("Confidencial.");
  });

  it("refuses to create a note on a student outside the clinic", async () => {
    expect(
      await studentNotes.createNote(coachA, {
        studentId: studentB,
        checkinId: null,
        body: "Não deveria existir.",
      }),
    ).toBeNull();
    // Scoped to clinic A: clinic B may legitimately have notes on its own
    // aluno, and this is about coach A never having written one.
    const rows = await db
      .select()
      .from(schema.studentNote)
      .where(
        and(
          eq(schema.studentNote.studentId, studentB),
          eq(schema.studentNote.clinicId, coachA.clinicId),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  it("only links a check-in that belongs to the same aluno", async () => {
    const mine = await makeCheckin(coachA.clinicId, studentA);
    const [other] = await db
      .insert(schema.students)
      .values({ clinicId: coachA.clinicId, firstName: "Outro", lastName: "Aluno" })
      .returning({ id: schema.students.id });
    const theirs = await makeCheckin(coachA.clinicId, other.id);

    expect(
      await studentNotes.checkinBelongsToStudent(coachA, studentA, mine),
    ).toBe(true);
    // Same clinic, wrong person — the timeline would quietly show it there.
    expect(
      await studentNotes.checkinBelongsToStudent(coachA, studentA, theirs),
    ).toBe(false);
  });

  it("deletes a note the coach no longer wants", async () => {
    const note = await studentNotes.createNote(coachA, {
      studentId: studentA,
      checkinId: null,
      body: "Nota errada.",
    });
    expect(await studentNotes.deleteNote(coachA, note!.id)).toBe(true);
    expect(await studentNotes.getNote(coachA, studentA, note!.id)).toBeNull();
  });
});

describe("the aluno's own reads never reach a note", () => {
  it("has no notes table access from the portal DAL", async () => {
    // A structural assertion, deliberately: the guarantee is that nothing in
    // student-facing code imports the notes module. If a portal read ever needs
    // it, this is the test that should have to be deleted on purpose.
    const portal = await import("@/server/dal/student-portal");
    const checkins = await import("@/server/dal/student-checkins");
    for (const mod of [portal, checkins]) {
      expect(Object.keys(mod).some((k) => k.toLowerCase().includes("note"))).toBe(
        false,
      );
    }
  });

  it("keeps a note out of every clinic-scoped check-in read", async () => {
    const checkinId = await makeCheckin(coachA.clinicId, studentA);
    await studentNotes.createNote(coachA, {
      studentId: studentA,
      checkinId,
      source: "ai_evaluation",
      body: "O aluno não pode ver isto.",
      payload: PAYLOAD,
      acceptance: "accepted",
    });

    const detail = await coachCheckins.getStudentCheckin(
      coachA,
      studentA,
      checkinId,
    );
    // Even the coach's own check-in detail carries no note text — notes live on
    // their own tab, behind their own route.
    expect(JSON.stringify(detail)).not.toContain("O aluno não pode ver isto.");
  });
});
