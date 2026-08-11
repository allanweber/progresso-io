// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { studentCheckins } from "@/server/dal";
import type { TenantContext } from "@/server/tenant";

import { createTestDb, type TestDb } from "./pglite";

/**
 * The aluno check-in DAL writes AND reads, doubly scoped: by clinic AND by the
 * student that belongs to the authenticated user. These tests prove the
 * boundary (an aluno only ever touches their own check-ins), the many-per-date
 * timeline, and that a coach annotation shows on the timeline but never feeds
 * the weight series.
 */

let db: TestDb;
let alunoCtxA: TenantContext; // clinic A, linked aluno
let alunoCtxB: TenantContext; // clinic B, a different linked aluno
let strangerCtxA: TenantContext; // clinic A, a user with no linked student
let studentA: string;

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
    { id: "aluno-b", name: "Bruno Costa", email: "bruno@example.com" },
    { id: "stranger", name: "Sem Aluno", email: "stranger@example.com" },
  ]);
  const [clinicA] = await db
    .insert(schema.clinic)
    .values({ name: "Studio Forja", ownerUserId: "coach-a" })
    .returning();
  const [clinicB] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic B", ownerUserId: "coach-b" })
    .returning();
  alunoCtxA = alunoCtx(clinicA.id, "aluno-a");
  alunoCtxB = alunoCtx(clinicB.id, "aluno-b");
  strangerCtxA = alunoCtx(clinicA.id, "stranger");

  const [sa] = await db
    .insert(schema.students)
    .values({
      clinicId: clinicA.id,
      coachId: "coach-a",
      userId: "aluno-a",
      firstName: "Ana",
      lastName: "Silva",
      email: "ana@example.com",
    })
    .returning({ id: schema.students.id });
  studentA = sa.id;

  await db.insert(schema.students).values({
    clinicId: clinicB.id,
    coachId: "coach-b",
    userId: "aluno-b",
    firstName: "Bruno",
    lastName: "Costa",
    email: "bruno@example.com",
  });
});

describe("student check-ins", () => {
  it("persists weight + note + the four pose photos for today", async () => {
    const created = await studentCheckins.createStudentCheckin(alunoCtxA, {
      weightKg: 71.4,
      note: "Semana boa.",
      photos: fourPhotos,
    });
    expect(created).not.toBeNull();
    expect(created).toMatchObject({
      date: today(),
      author: "student",
      weightKg: 71.4,
      note: "Semana boa.",
      photoCount: 4,
    });

    // The photo rows landed, one per pose, scoped to the clinic.
    const photos = await db
      .select()
      .from(schema.studentCheckinPhoto)
      .where(eq(schema.studentCheckinPhoto.checkinId, created!.id));
    expect(photos).toHaveLength(4);
    expect(new Set(photos.map((p) => p.pose))).toEqual(
      new Set(schema.CHECKIN_POSES),
    );

    // The timeline + weight series surface it for the owner.
    const list = await studentCheckins.listMyCheckins(alunoCtxA);
    expect(list!.checkins.some((c) => c.id === created!.id)).toBe(true);
    expect(list!.weightSeries).toContainEqual({ date: today(), weightKg: 71.4 });
  });

  it("allows many check-ins on the same date and surfaces coach annotations", async () => {
    // A second student check-in on the same date is allowed (many per date).
    const second = await studentCheckins.createStudentCheckin(alunoCtxA, {
      weightKg: 71.2,
      note: null,
      photos: fourPhotos,
    });
    expect(second).not.toBeNull();

    // A coach annotation for the same student/date: no weight, no photos.
    await db.insert(schema.studentCheckin).values({
      clinicId: alunoCtxA.clinicId,
      studentId: studentA,
      date: today(),
      author: "coach",
      authorUserId: "coach-a",
      weightKg: null,
      note: "Ótima evolução, seguir assim.",
    });

    const list = await studentCheckins.listMyCheckins(alunoCtxA);
    const coachEntry = list!.checkins.find((c) => c.author === "coach");
    expect(coachEntry?.note).toBe("Ótima evolução, seguir assim.");
    expect(coachEntry?.weightKg).toBeNull();
    expect(coachEntry?.photoCount).toBe(0);
    // The coach annotation (no weight) never feeds the chart.
    expect(list!.weightSeries.every((p) => typeof p.weightKg === "number")).toBe(
      true,
    );
  });

  it("exposes a check-in's detail + photos, owner-scoped", async () => {
    const created = await studentCheckins.createStudentCheckin(alunoCtxA, {
      weightKg: 70.5,
      note: "Detalhe.",
      photos: fourPhotos,
    });

    const detail = await studentCheckins.getMyCheckin(alunoCtxA, created!.id);
    expect(detail).not.toBeNull();
    expect(detail!.photos).toHaveLength(4);
    expect(new Set(detail!.photos.map((p) => p.pose))).toEqual(
      new Set(schema.CHECKIN_POSES),
    );

    const photoId = detail!.photos[0].id;
    const photo = await studentCheckins.getMyCheckinPhoto(
      alunoCtxA,
      created!.id,
      photoId,
    );
    expect(photo?.r2Key).toContain("checkins/");

    // Another clinic's aluno can read neither the detail nor a photo.
    expect(await studentCheckins.getMyCheckin(alunoCtxB, created!.id)).toBeNull();
    expect(
      await studentCheckins.getMyCheckinPhoto(alunoCtxB, created!.id, photoId),
    ).toBeNull();
  });

  it("scopes reads + writes to the caller's own student", async () => {
    // Clinic B's aluno never sees clinic A's check-ins.
    const bList = await studentCheckins.listMyCheckins(alunoCtxB);
    expect(bList).toEqual({ checkins: [], weightSeries: [] });

    // A user with no linked student can neither read nor write.
    expect(await studentCheckins.listMyCheckins(strangerCtxA)).toBeNull();
    expect(
      await studentCheckins.createStudentCheckin(strangerCtxA, {
        weightKg: 80,
        note: null,
        photos: fourPhotos,
      }),
    ).toBeNull();
  });
});
