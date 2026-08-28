// @vitest-environment node
import { randomUUID } from "node:crypto";

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
      date: today(),
      modality: "in_person",
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
      date: today(),
      modality: "in_person",
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
        date: today(),
        modality: "in_person",
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

  it("deletes a check-in for good, cascading its photos and assessment", async () => {
    const created = await coachCheckins.createCoachCheckin(coachCtxA, studentA, {
      date: today(),
      modality: "in_person",
      weightKg: 68.5,
      note: "Duplicado — para excluir.",
      photos: fourPhotos,
      assessment: {
        circumferences: { cintura: 80 },
        skinfolds: {},
        bodyFatPct: null,
      },
    });

    // Another clinic's coach cannot delete it, and neither can a bad id.
    expect(
      await coachCheckins.deleteCheckin(coachCtxB, studentA, created!.id),
    ).toBeNull();
    expect(
      await coachCheckins.deleteCheckin(coachCtxA, studentA, randomUUID()),
    ).toBeNull();

    // The keys come back so the route can remove the bytes after the commit.
    const keys = await coachCheckins.deleteCheckin(
      coachCtxA,
      studentA,
      created!.id,
    );
    expect(keys).toHaveLength(4);

    expect(
      await coachCheckins.getStudentCheckin(coachCtxA, studentA, created!.id),
    ).toBeNull();
    expect(
      await db
        .select()
        .from(schema.checkinAssessment)
        .where(eq(schema.checkinAssessment.checkinId, created!.id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.studentCheckinPhoto)
        .where(eq(schema.studentCheckinPhoto.checkinId, created!.id)),
    ).toHaveLength(0);
  });

  it("backdates an imported check-in, dating its assessment with it", async () => {
    const created = await coachCheckins.createCoachCheckin(coachCtxA, studentA, {
      date: "2024-03-11",
      modality: "in_person",
      weightKg: 80,
      note: "Importado da planilha antiga.",
      photos: [],
      assessment: {
        circumferences: { cintura: 92 },
        skinfolds: {},
        bodyFatPct: null,
      },
    });
    expect(created!.date).toBe("2024-03-11");

    const [assessment] = await db
      .select()
      .from(schema.checkinAssessment)
      .where(eq(schema.checkinAssessment.checkinId, created!.id));
    expect(assessment.assessedAt).toBe("2024-03-11");
  });

  it("freezes the plan of record by DATE, archived plans included", async () => {
    // No plan published yet → the entry above honestly carries none.
    const beforeAnyPlan = await coachCheckins.createCoachCheckin(
      coachCtxA,
      studentA,
      {
        date: "2024-02-01",
        modality: "in_person",
        weightKg: 81,
        note: null,
        photos: [],
        assessment: null,
      },
    );
    const bare = await coachCheckins.getStudentCheckin(
      coachCtxA,
      studentA,
      beforeAnyPlan!.id,
    );
    expect(bare!.diet).toBeNull();
    expect(bare!.workout).toBeNull();

    // A diet published in March and later ARCHIVED, then a second one in July.
    const [marchDiet] = await db
      .insert(schema.studentDiet)
      .values({
        clinicId: clinicAId,
        studentId: studentA,
        name: "Cutting março",
        status: "archived",
      })
      .returning();
    await db.insert(schema.studentDietVersion).values({
      studentDietId: marchDiet.id,
      version: 1,
      status: "published",
      tree: { meals: [] },
      publishedAt: new Date("2024-03-05T12:00:00Z"),
    });

    const [julyDiet] = await db
      .insert(schema.studentDiet)
      .values({
        clinicId: clinicAId,
        studentId: studentA,
        name: "Bulking julho",
        status: "active",
      })
      .returning();
    await db.insert(schema.studentDietVersion).values({
      studentDietId: julyDiet.id,
      version: 1,
      status: "published",
      tree: { meals: [] },
      publishedAt: new Date("2024-07-02T12:00:00Z"),
    });

    // A workout published the very morning of the check-in below.
    const [wk] = await db
      .insert(schema.studentWorkout)
      .values({
        clinicId: clinicAId,
        studentId: studentA,
        name: "ABC abril",
        status: "active",
      })
      .returning();
    await db.insert(schema.studentWorkoutVersion).values({
      studentWorkoutId: wk.id,
      version: 3,
      status: "published",
      tree: { sessions: [] },
      publishedAt: new Date("2024-04-20T09:30:00Z"),
    });

    // A check-in imported for 20/04: March's (archived) diet was the plan of
    // record, NOT July's — and the workout published that same morning counts.
    const april = await coachCheckins.createCoachCheckin(coachCtxA, studentA, {
      date: "2024-04-20",
      modality: "in_person",
      weightKg: 79,
      note: null,
      photos: [],
      assessment: null,
    });
    const detail = await coachCheckins.getStudentCheckin(
      coachCtxA,
      studentA,
      april!.id,
    );
    expect(detail!.diet).toMatchObject({ name: "Cutting março", version: 1 });
    expect(detail!.workout).toMatchObject({ name: "ABC abril", version: 3 });

    // Deleting the diet leaves the label readable, with nothing left to open.
    await db
      .delete(schema.studentDiet)
      .where(eq(schema.studentDiet.id, marchDiet.id));
    const orphaned = await coachCheckins.getStudentCheckin(
      coachCtxA,
      studentA,
      april!.id,
    );
    expect(orphaned!.diet).toEqual({
      versionId: null,
      name: "Cutting março",
      version: 1,
    });
  });

  it("swaps two photos when a pose landed in the wrong slot", async () => {
    const created = await coachCheckins.createCoachCheckin(coachCtxA, studentA, {
      date: today(),
      modality: "in_person",
      weightKg: 70,
      note: "Fotos trocadas.",
      photos: fourPhotos,
      assessment: null,
    });
    const before = await coachCheckins.getStudentCheckin(
      coachCtxA,
      studentA,
      created!.id,
    );
    const left = before!.photos.find((p) => p.pose === "lado_esquerdo")!;
    const right = before!.photos.find((p) => p.pose === "lado_direito")!;

    const photos = await coachCheckins.movePhotoToPose(
      coachCtxA,
      studentA,
      created!.id,
      left.id,
      "lado_direito",
    );
    expect(photos).not.toBeNull();

    // The two traded LABELS…
    const poseById = new Map(photos!.map((p) => [p.id, p.pose]));
    expect(poseById.get(left.id)).toBe("lado_direito");
    expect(poseById.get(right.id)).toBe("lado_esquerdo");
    // …still one photo per pose, still in grid order.
    expect(photos!.map((p) => p.pose)).toEqual([
      "frente",
      "costas",
      "lado_esquerdo",
      "lado_direito",
    ]);

    // …and the BYTES never moved: each id still points at its own stored key,
    // so a cached photo URL stays correct.
    const [stored] = await db
      .select()
      .from(schema.studentCheckinPhoto)
      .where(eq(schema.studentCheckinPhoto.id, left.id));
    expect(stored.r2Key).toBe("checkins/test-lado_esquerdo.webp");
    expect(stored.pose).toBe("lado_direito");

    // Another clinic's coach cannot touch it, and neither can a bad photo id.
    expect(
      await coachCheckins.movePhotoToPose(
        coachCtxB,
        studentA,
        created!.id,
        left.id,
        "frente",
      ),
    ).toBeNull();
    expect(
      await coachCheckins.movePhotoToPose(
        coachCtxA,
        studentA,
        created!.id,
        randomUUID(),
        "frente",
      ),
    ).toBeNull();
  });

  it("moves a photo into a free pose when the check-in is incomplete", async () => {
    const created = await coachCheckins.createCoachCheckin(coachCtxA, studentA, {
      date: today(),
      modality: "in_person",
      weightKg: null,
      note: "Uma foto só.",
      photos: [{ pose: "frente", r2Key: "checkins/test-only.webp" }],
      assessment: null,
    });
    const detail = await coachCheckins.getStudentCheckin(
      coachCtxA,
      studentA,
      created!.id,
    );
    const only = detail!.photos[0];

    const photos = await coachCheckins.movePhotoToPose(
      coachCtxA,
      studentA,
      created!.id,
      only.id,
      "costas",
    );
    expect(photos).toEqual([{ id: only.id, pose: "costas" }]);

    // Re-selecting the pose it already holds is a no-op, not an error.
    expect(
      await coachCheckins.movePhotoToPose(
        coachCtxA,
        studentA,
        created!.id,
        only.id,
        "costas",
      ),
    ).toEqual([{ id: only.id, pose: "costas" }]);
  });

  it("edits every field, re-resolving the plan when the date moves", async () => {
    const created = await coachCheckins.createCoachCheckin(coachCtxA, studentA, {
      date: "2024-08-01",
      modality: "in_person",
      weightKg: 77,
      note: "Antes da correção.",
      photos: fourPhotos,
      assessment: {
        circumferences: { cintura: 90 },
        skinfolds: {},
        bodyFatPct: null,
      },
    });
    const before = await coachCheckins.getStudentCheckin(
      coachCtxA,
      studentA,
      created!.id,
    );
    // Filed in August, so it carried July's diet.
    expect(before!.diet).toMatchObject({ name: "Bulking julho" });

    const result = await coachCheckins.updateCheckin(
      coachCtxA,
      studentA,
      created!.id,
      {
        date: "2024-05-01",
        modality: "in_person",
        weightKg: 76.4,
        note: "Depois da correção.",
        photos: [{ pose: "frente", r2Key: "checkins/test-new-frente.webp" }],
        removePoses: ["costas"],
        assessment: {
          circumferences: { cintura: 88 },
          skinfolds: {},
          bodyFatPct: null,
        },
      },
    );
    expect(result).not.toBeNull();
    const d = result!.detail;

    expect(d.date).toBe("2024-05-01");
    expect(d.weightKg).toBe(76.4);
    expect(d.note).toBe("Depois da correção.");

    // The snapshot followed the corrected date: no diet was published by May
    // (March's was deleted above, July's comes later)…
    expect(d.diet).toBeNull();
    // …while April's workout still stood on that day.
    expect(d.workout).toMatchObject({ name: "ABC abril", version: 3 });

    // The measures are dated with the check-in, not left behind in August.
    expect(d.assessment).toMatchObject({
      assessedAt: "2024-05-01",
      circumferences: { cintura: 88 },
    });

    // frente replaced, costas dropped, the two sides untouched.
    expect(d.photos.map((p) => p.pose)).toEqual([
      "frente",
      "lado_esquerdo",
      "lado_direito",
    ]);
    // Both the replaced and the removed key come back for byte deletion.
    expect([...result!.orphanedKeys].sort()).toEqual([
      "checkins/test-costas.webp",
      "checkins/test-frente.webp",
    ]);

    // An edit that names no pose leaves every photo exactly where it was.
    const untouched = await coachCheckins.updateCheckin(
      coachCtxA,
      studentA,
      created!.id,
      {
        date: "2024-05-01",
        modality: "in_person",
        weightKg: 76.4,
        note: "Só o texto mudou.",
        photos: [],
        removePoses: [],
        assessment: {
          circumferences: { cintura: 88 },
          skinfolds: {},
          bodyFatPct: null,
        },
      },
    );
    expect(untouched!.orphanedKeys).toEqual([]);
    expect(untouched!.detail.photos).toHaveLength(3);

    // On an edit, no measures means REMOVE the measures.
    const cleared = await coachCheckins.updateCheckin(
      coachCtxA,
      studentA,
      created!.id,
      {
        date: "2024-05-01",
        modality: "in_person",
        weightKg: 76.4,
        note: "Sem medidas.",
        photos: [],
        removePoses: [],
        assessment: null,
      },
    );
    expect(cleared!.detail.assessment).toBeNull();
    expect(
      await db
        .select()
        .from(schema.checkinAssessment)
        .where(eq(schema.checkinAssessment.checkinId, created!.id)),
    ).toHaveLength(0);

    // Another clinic's coach cannot edit it.
    expect(
      await coachCheckins.updateCheckin(coachCtxB, studentA, created!.id, {
        date: "2024-05-01",
        modality: "in_person",
        weightKg: 1000,
        note: "hack",
        photos: [],
        removePoses: [],
        assessment: null,
      }),
    ).toBeNull();
  });

  it("edits an aluno's own submission too", async () => {
    const submitted = await studentCheckins.createStudentCheckin(alunoCtxA, {
      weightKg: 99.9,
      note: "Peso digitado errado.",
      photos: [],
    });

    const result = await coachCheckins.updateCheckin(
      coachCtxA,
      studentA,
      submitted!.id,
      {
        date: submitted!.date,
        modality: "online",
        weightKg: 79.9,
        note: "Peso digitado errado.",
        photos: [],
        removePoses: [],
        assessment: null,
      },
    );
    expect(result!.detail.weightKg).toBe(79.9);
    // Still the aluno's entry — an edit corrects the record, it does not steal
    // authorship or clear the pending state.
    expect(result!.detail.author).toBe("student");
    expect(result!.detail.feedbackAt).toBeNull();
  });

  it("records the modality the coach stated, and lets an edit correct it", async () => {
    // The default a coach logs by hand: they were in the room.
    const presencial = await coachCheckins.createCoachCheckin(
      coachCtxA,
      studentA,
      {
        date: today(),
        modality: "in_person",
        weightKg: 70.1,
        note: "Avaliação no estúdio.",
        photos: [],
        assessment: null,
      },
    );
    expect(presencial!.modality).toBe("in_person");

    // A check-in the student sent over WhatsApp, typed in by the coach — same
    // author, different modality. Guessing from the payload could never tell
    // these two apart.
    const online = await coachCheckins.createCoachCheckin(coachCtxA, studentA, {
      date: today(),
      modality: "online",
      weightKg: 70.0,
      note: "Passou o peso pelo WhatsApp.",
      photos: [],
      assessment: null,
    });
    expect(online!.modality).toBe("online");

    // Filed under the wrong one? The edit fixes it like any other field.
    const fixed = await coachCheckins.updateCheckin(
      coachCtxA,
      studentA,
      online!.id,
      {
        date: online!.date,
        modality: "in_person",
        weightKg: 70.0,
        note: "Na verdade foi presencial.",
        photos: [],
        removePoses: [],
        assessment: null,
      },
    );
    expect(fixed!.detail.modality).toBe("in_person");

    // An aluno's own submission is online by construction — there is no other
    // way for it to reach the portal.
    const submitted = await studentCheckins.createStudentCheckin(alunoCtxA, {
      weightKg: 70.2,
      note: "Enviado pelo portal.",
      photos: [],
    });
    expect(submitted!.modality).toBe("online");
  });
});
