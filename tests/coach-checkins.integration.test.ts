// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { coachCheckins, studentCheckins } from "@/server/dal";
import type { TenantContext } from "@/server/tenant";

import { createTestDb, type TestDb } from "./pglite";

/**
 * The coach check-in DAL: clinic-scoped reads/writes over ANY student in the
 * coach's clinic, and always confirming the student is in this clinic first.
 * These tests prove the boundary (no cross-clinic access), the feedback →
 * pending-cleared lifecycle (surfaced to the aluno too), the assessment upsert,
 * the manual coach check-in, and the evolution aggregation. Plus: an aluno
 * submission raises a `checkin_submitted` notification for the clinic.
 */

let db: TestDb;
let coachCtxA: TenantContext; // clinic A coach
let coachCtxB: TenantContext; // clinic B coach (the outsider)
let alunoCtxA: TenantContext; // clinic A aluno (owns studentA)
let studentA: string;
let clinicAId: string;

function coachCtx(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "coach" };
}
function alunoCtx(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "aluno" };
}

const today = () => new Date().toISOString().slice(0, 10);
const fourPhotos = schema.CHECKIN_POSES.map((pose) => ({
  pose,
  r2Key: `checkins/test-${pose}.webp`,
}));

beforeAll(async () => {
  db = await createTestDb();

  await db.insert(schema.user).values([
    { id: "coach-a", name: "Coach A", email: "coach-a@example.com" },
    { id: "coach-b", name: "Coach B", email: "coach-b@example.com" },
    { id: "aluno-a", name: "Ana Silva", email: "ana@example.com" },
  ]);
  const [clinicA] = await db
    .insert(schema.clinic)
    .values({ name: "Studio Forja", ownerUserId: "coach-a" })
    .returning();
  const [clinicB] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic B", ownerUserId: "coach-b" })
    .returning();
  clinicAId = clinicA.id;
  coachCtxA = coachCtx(clinicA.id, "coach-a");
  coachCtxB = coachCtx(clinicB.id, "coach-b");
  alunoCtxA = alunoCtx(clinicA.id, "aluno-a");

  const [sa] = await db
    .insert(schema.students)
    .values({
      clinicId: clinicA.id,
      coachId: "coach-a",
      userId: "aluno-a",
      firstName: "Ana",
      lastName: "Silva",
      phone: "+5511999990000",
    })
    .returning({ id: schema.students.id });
  studentA = sa.id;
});

describe("coach check-in DAL", () => {
  it("raises a checkin_submitted notification when the aluno submits", async () => {
    const created = await studentCheckins.createStudentCheckin(alunoCtxA, {
      weightKg: 72.0,
      note: "Primeira.",
      photos: fourPhotos,
    });
    expect(created).not.toBeNull();

    const notifs = await db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.clinicId, clinicAId),
          eq(schema.notification.type, "checkin_submitted"),
        ),
      );
    expect(notifs).toHaveLength(1);
    expect(notifs[0].data).toMatchObject({
      studentId: studentA,
      studentName: "Ana Silva",
      checkinDate: today(),
    });

    // A fresh student submission is pending on the coach's timeline.
    const list = await coachCheckins.listStudentCheckins(coachCtxA, studentA);
    const entry = list!.checkins.find((c) => c.id === created!.id);
    expect(entry).toMatchObject({ author: "student", feedback: null, feedbackAt: null });
  });

  it("records feedback + an assessment, clearing the pending state for the aluno", async () => {
    const created = await studentCheckins.createStudentCheckin(alunoCtxA, {
      weightKg: 71.5,
      note: "Responder isso.",
      photos: fourPhotos,
    });

    const detail = await coachCheckins.submitFeedback(
      coachCtxA,
      studentA,
      created!.id,
      {
        feedback: "Ótima evolução, seguir assim!",
        assessment: {
          circumferences: { cintura: 79 },
          skinfolds: { tricipital: 13 },
          bodyFatPct: 18.5,
        },
      },
    );
    expect(detail).not.toBeNull();
    expect(detail!.feedback).toBe("Ótima evolução, seguir assim!");
    expect(detail!.feedbackAt).not.toBeNull();
    expect(detail!.assessment).toMatchObject({
      circumferences: { cintura: 79 },
      skinfolds: { tricipital: 13 },
      bodyFatPct: 18.5,
    });

    // The row carries the coach as the feedback author.
    const [row] = await db
      .select({ by: schema.studentCheckin.feedbackByUserId })
      .from(schema.studentCheckin)
      .where(eq(schema.studentCheckin.id, created!.id));
    expect(row.by).toBe("coach-a");

    // The aluno now sees the feedback + measures on their own read, no longer pending.
    const mine = await studentCheckins.getMyCheckin(alunoCtxA, created!.id);
    expect(mine!.feedback).toBe("Ótima evolução, seguir assim!");
    expect(mine!.assessment?.bodyFatPct).toBe(18.5);

    // A second feedback REPLACES the assessment (upsert on the unique checkin).
    await coachCheckins.submitFeedback(coachCtxA, studentA, created!.id, {
      feedback: "Ajuste: subir carga.",
      assessment: { circumferences: { cintura: 78 }, skinfolds: {}, bodyFatPct: null },
    });
    const after = await coachCheckins.getStudentCheckin(coachCtxA, studentA, created!.id);
    expect(after!.feedback).toBe("Ajuste: subir carga.");
    expect(after!.assessment).toMatchObject({ circumferences: { cintura: 78 } });
    const assessCount = await db
      .select()
      .from(schema.checkinAssessment)
      .where(eq(schema.checkinAssessment.checkinId, created!.id));
    expect(assessCount).toHaveLength(1); // upserted, not duplicated
  });

  it("logs a coach manual check-in with photos + an assessment", async () => {
    const created = await coachCheckins.createCoachCheckin(coachCtxA, studentA, {
      weightKg: 71.2,
      note: "Avaliação presencial.",
      photos: fourPhotos,
      assessment: {
        circumferences: { quadril: 98 },
        skinfolds: { abdominal: 20 },
        bodyFatPct: 17.9,
      },
    });
    expect(created).toMatchObject({
      author: "coach",
      weightKg: 71.2,
      photoCount: 4,
      hasAssessment: true,
    });

    const detail = await coachCheckins.getStudentCheckin(
      coachCtxA,
      studentA,
      created!.id,
    );
    expect(detail!.photos).toHaveLength(4);
    expect(detail!.assessment?.bodyFatPct).toBe(17.9);
  });

  it("never lets another clinic's coach read or write", async () => {
    const created = await coachCheckins.createCoachCheckin(coachCtxA, studentA, {
      weightKg: 70,
      note: null,
      photos: fourPhotos,
      assessment: null,
    });

    // Clinic B's coach sees nothing of studentA (not in their clinic).
    expect(await coachCheckins.listStudentCheckins(coachCtxB, studentA)).toBeNull();
    expect(
      await coachCheckins.getStudentCheckin(coachCtxB, studentA, created!.id),
    ).toBeNull();
    expect(
      await coachCheckins.submitFeedback(coachCtxB, studentA, created!.id, {
        feedback: "hack",
        assessment: null,
      }),
    ).toBeNull();
    expect(
      await coachCheckins.createCoachCheckin(coachCtxB, studentA, {
        weightKg: 60,
        note: null,
        photos: [],
        assessment: null,
      }),
    ).toBeNull();

    // Photo reads are clinic-scoped: A's coach resolves a key, B's does not.
    const detail = await coachCheckins.getStudentCheckin(coachCtxA, studentA, created!.id);
    const photoId = detail!.photos[0].id;
    expect(
      await coachCheckins.getStudentCheckinPhoto(coachCtxA, studentA, created!.id, photoId),
    ).not.toBeNull();
    expect(
      await coachCheckins.getStudentCheckinPhoto(coachCtxB, studentA, created!.id, photoId),
    ).toBeNull();
  });

  it("aggregates the evolution: weight series, assessments, photo sets", async () => {
    const evo = await coachCheckins.getStudentEvolution(coachCtxA, studentA);
    expect(evo).not.toBeNull();

    // Weight series is oldest → newest and monotonic in date.
    const dates = evo!.weightSeries.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
    expect(evo!.weightSeries.length).toBeGreaterThan(0);

    // Assessments recorded above appear on the trend.
    expect(evo!.assessments.length).toBeGreaterThanOrEqual(2);
    // Photo sets only include check-ins that carry photos.
    expect(evo!.photoSets.length).toBeGreaterThan(0);
    expect(evo!.photoSets.every((s) => s.photos.length === 4)).toBe(true);

    // Cross-clinic gets nothing.
    expect(await coachCheckins.getStudentEvolution(coachCtxB, studentA)).toBeNull();
  });
});
