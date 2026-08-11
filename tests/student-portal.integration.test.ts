// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { TenantContext } from "@/server/tenant";
import { studentDiets, studentPortal } from "@/server/dal";
import type { DietWriteInput } from "@/server/dal/diets";

import { createTestDb, type TestDb } from "./pglite";

/**
 * The aluno-facing portal DAL is read-only and doubly scoped: by clinic AND by
 * the student that belongs to the authenticated user. These tests prove the
 * boundary — an aluno sees only their own published data, never a draft, and
 * never another student's/clinic's diet.
 */

let db: TestDb;
let coachCtxA: TenantContext; // clinic A, as the coach (to publish)
let alunoCtxA: TenantContext; // clinic A, as the aluno (read-only portal)
let alunoCtxB: TenantContext; // clinic B, a different aluno
let strangerCtxA: TenantContext; // clinic A, a user with no linked student
let studentA: string;
let arrozId: string;
let frangoId: string;
let v1VersionId: string;
let draftVersionId: string;

function coachCtx(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "coach" };
}
function alunoCtx(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "aluno" };
}

async function addFood(f: {
  description: string;
  clinicId?: string | null;
  energyKcal?: number | null;
  protein?: number | null;
}) {
  const [group] = await db
    .select({ id: schema.foodGroup.id })
    .from(schema.foodGroup)
    .where(sql`${schema.foodGroup.slug} = 'cereais-e-derivados'`);
  const [row] = await db
    .insert(schema.food)
    .values({
      description: f.description,
      searchText: sql`unaccent(lower(${f.description}))`,
      groupId: group.id,
      type: "ingrediente",
      clinicId: f.clinicId ?? null,
      energyKcal: f.energyKcal ?? null,
      protein: f.protein ?? null,
    })
    .returning({ id: schema.food.id });
  return row.id;
}

function mealPayload(grams = 200, name = "Cutting"): DietWriteInput {
  return {
    name,
    notes: "Beber água",
    meals: [
      {
        name: "Café da manhã",
        time: "08:00",
        items: [
          {
            foodId: arrozId,
            grams,
            substitutes: [{ foodId: frangoId, grams: 120 }],
          },
        ],
      },
    ],
  };
}

beforeAll(async () => {
  db = await createTestDb();

  await db.insert(schema.user).values([
    { id: "coach-a", name: "Thiago Corrêa", email: "coach-a@example.com" },
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
  coachCtxA = coachCtx(clinicA.id, "coach-a");
  alunoCtxA = alunoCtx(clinicA.id, "aluno-a");
  alunoCtxB = alunoCtx(clinicB.id, "aluno-b");
  strangerCtxA = alunoCtx(clinicA.id, "stranger");

  await db
    .insert(schema.foodGroup)
    .values([{ name: "Cereais e derivados", slug: "cereais-e-derivados" }]);
  arrozId = await addFood({
    description: "Arroz branco cozido",
    energyKcal: 128,
    protein: 2.5,
  });
  frangoId = await addFood({
    description: "Peito de frango grelhado",
    clinicId: clinicA.id,
    energyKcal: 165,
    protein: 31,
  });

  // studentA belongs to clinic A, is coached by coach-a, and is linked to the
  // aluno-a login, with a goal (for the profile card).
  const [sa] = await db
    .insert(schema.students)
    .values({
      clinicId: clinicA.id,
      coachId: "coach-a",
      userId: "aluno-a",
      firstName: "Ana",
      lastName: "Silva",
      email: "ana@example.com",
      goal: "hipertrofia",
    })
    .returning({ id: schema.students.id });
  studentA = sa.id;

  // studentB belongs to clinic B, linked to aluno-b — but has no diet.
  await db.insert(schema.students).values({
    clinicId: clinicB.id,
    coachId: "coach-b",
    userId: "aluno-b",
    firstName: "Bruno",
    lastName: "Costa",
    email: "bruno@example.com",
  });

  // The coach publishes v1 for studentA, then opens an (unpublished) draft v2.
  await studentDiets.createBlankDraft(coachCtxA, studentA, "Cutting");
  await studentDiets.publishDraft(coachCtxA, studentA, mealPayload(200));
  await studentDiets.editActive(coachCtxA, studentA); // draft v2, never published

  const versions = await db
    .select({
      id: schema.studentDietVersion.id,
      status: schema.studentDietVersion.status,
      version: schema.studentDietVersion.version,
    })
    .from(schema.studentDietVersion);
  v1VersionId = versions.find(
    (v) => v.status === "published" && v.version === 1,
  )!.id;
  draftVersionId = versions.find((v) => v.status === "draft")!.id;
});

describe("student portal DAL (aluno-facing, read-only)", () => {
  it("resolves the aluno's own profile from the session", async () => {
    const profile = await studentPortal.getMyProfile(alunoCtxA);
    expect(profile).toEqual({
      name: "Ana Silva",
      firstName: "Ana",
      coachName: "Thiago Corrêa",
      clinicName: "Studio Forja",
      goal: "hipertrofia",
      // The clinic's check-in cadence (defaults from the migration).
      feedbackFrequency: "semanal",
      feedbackPreferredDay: "monday",
    });
  });

  it("returns the active published diet + history, and NEVER a draft", async () => {
    const state = await studentPortal.getMyDietState(alunoCtxA);
    expect(state).not.toBeNull();
    // The DTO has no draft field at all — the unpublished v2 is invisible.
    expect("draft" in state!).toBe(false);
    expect(state!.current!.version).toBe(1);
    expect(state!.current!.dietName).toBe("Cutting");
    // History exposes only the published version (v1), not the draft v2.
    expect(state!.history).toHaveLength(1);
    expect(state!.history[0].versions.map((v) => v.version)).toEqual([1]);
  });

  it("reads a published version's tree, but not a draft version", async () => {
    const published = await studentPortal.getMyDietVersion(
      alunoCtxA,
      v1VersionId,
    );
    expect(published!.version).toBe(1);
    expect(published!.tree.meals[0].items[0].description).toBe(
      "Arroz branco cozido",
    );

    // The in-flight draft version must never be readable by the aluno.
    const draft = await studentPortal.getMyDietVersion(
      alunoCtxA,
      draftVersionId,
    );
    expect(draft).toBeNull();
  });

  it("shows catalog substitutes live — added after publish, no re-publish", async () => {
    // Before: arroz has no catalog substitute.
    let state = await studentPortal.getMyDietState(alunoCtxA);
    expect(state!.current!.tree.meals[0].items[0].foodSubstitutes ?? []).toEqual(
      [],
    );

    // The coach adds a base catalog substitution for arroz…
    const batataId = await addFood({ description: "Batata doce", energyKcal: 77 });
    await db.insert(schema.foodSubstitution).values({
      clinicId: null,
      foodId: arrozId,
      substituteFoodId: batataId,
      grams: 167,
    });

    // …and the aluno sees it immediately, with no re-publish of the diet.
    state = await studentPortal.getMyDietState(alunoCtxA);
    expect(state!.current!.tree.meals[0].items[0].foodSubstitutes).toEqual([
      { foodId: batataId, description: "Batata doce", grams: 167 },
    ]);
  });

  it("never leaks another aluno's / clinic's diet", async () => {
    // Aluno B (clinic B) has no diet of their own.
    const stateB = await studentPortal.getMyDietState(alunoCtxB);
    expect(stateB).toEqual({ current: null, history: [] });

    // Aluno B cannot open aluno A's published version.
    const crossVersion = await studentPortal.getMyDietVersion(
      alunoCtxB,
      v1VersionId,
    );
    expect(crossVersion).toBeNull();
  });

  it("returns null for a user with no linked student", async () => {
    expect(await studentPortal.getMyProfile(strangerCtxA)).toBeNull();
    expect(await studentPortal.getMyDietState(strangerCtxA)).toBeNull();
    expect(
      await studentPortal.getMyDietVersion(strangerCtxA, v1VersionId),
    ).toBeNull();
  });
});
