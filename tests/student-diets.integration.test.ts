// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { TenantContext } from "@/server/tenant";
import { diets, studentDiets } from "@/server/dal";
import type { DietWriteInput } from "@/server/dal/diets";

import { createTestDb, type TestDb } from "./pglite";

let db: TestDb;
let ctxA: TenantContext;
let ctxB: TenantContext;
let studentA: string; // a student in clinic A
let studentB: string; // a student in clinic B
let arrozId: string; // base food
let frangoId: string; // clinic A food
let batataId: string; // base food (a catalog substitute for arroz)

function ctxFor(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "coach" };
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

/** A one-meal payload: `grams` of arroz (base) with a frango equivalence. */
function mealPayload(grams = 200, name = "Dieta do aluno"): DietWriteInput {
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
  // A base catalog substitute for arroz, so buildTree can freeze it into trees.
  batataId = await addFood({
    description: "Batata doce cozida",
    energyKcal: 77,
    protein: 0.6,
  });
  await db.insert(schema.foodSubstitution).values({
    clinicId: null,
    foodId: arrozId,
    substituteFoodId: batataId,
    grams: 167,
  });

  const [sa] = await db
    .insert(schema.students)
    .values({
      clinicId: clinicA.id,
      firstName: "Ana",
      lastName: "Silva",
      email: "ana@example.com",
    })
    .returning({ id: schema.students.id });
  studentA = sa.id;
  const [sb] = await db
    .insert(schema.students)
    .values({
      clinicId: clinicB.id,
      firstName: "Bruno",
      lastName: "Costa",
      email: "bruno@example.com",
    })
    .returning({ id: schema.students.id });
  studentB = sb.id;
});

describe("student diets DAL", () => {
  it("drafts, saves with an embedded snapshot, and publishes v1", async () => {
    const created = await studentDiets.createBlankDraft(ctxA, studentA, "Cutting");
    expect(created.ok).toBe(true);

    // A brand-new diet's draft: no current yet.
    let state = await studentDiets.getStudentDietState(ctxA, studentA);
    expect(state!.draft).not.toBeNull();
    expect(state!.draft!.isNewDiet).toBe(true);
    expect(state!.current).toBeNull();

    // Save the tree — the DAL embeds description + macros.
    const saved = await studentDiets.saveDraft(ctxA, studentA, mealPayload(200, "Cutting"));
    expect(saved.ok).toBe(true);

    state = await studentDiets.getStudentDietState(ctxA, studentA);
    const item = state!.draft!.tree.meals[0].items[0];
    expect(item.description).toBe("Arroz branco cozido");
    expect(item.origin).toBe("base");
    // 200 g arroz (128/100) = 256 kcal, computed live on read.
    expect(item.macros.energyKcal).toBeCloseTo(256);
    expect(item.per100.energyKcal).toBe(128);
    // The diet stores no per-item equivalences; swaps are the food's catalog
    // substitutes, live (arroz → batata from beforeAll).
    expect(item.substitutes).toEqual([]);
    expect(item.foodSubstitutes).toEqual([
      { foodId: batataId, description: "Batata doce cozida", grams: 167 },
    ]);
    expect(state!.draft!.tree.totals.energyKcal).toBeCloseTo(256);

    // Publish → v1 active, no draft.
    const pub = await studentDiets.publishDraft(ctxA, studentA, mealPayload(200, "Cutting"));
    expect(pub).toMatchObject({ ok: true, version: 1 });

    state = await studentDiets.getStudentDietState(ctxA, studentA);
    expect(state!.draft).toBeNull();
    expect(state!.current!.version).toBe(1);
    expect(state!.activeDietId).toBe(state!.current!.dietId);
    expect(state!.history).toHaveLength(1);
    expect(state!.history[0].status).toBe("active");
  });

  it("reflects a live base-food edit in the published version", async () => {
    // The diet stores references, not a snapshot — a catalog edit propagates to
    // the already-published version with no re-publish.
    await db
      .update(schema.food)
      .set({ energyKcal: 999 })
      .where(sql`${schema.food.id} = ${arrozId}`);

    const after = await studentDiets.getStudentDietState(ctxA, studentA);
    // 200 g arroz at 999/100 = 1998 kcal, derived live on read.
    expect(after!.current!.tree.meals[0].items[0].macros.energyKcal).toBeCloseTo(
      1998,
    );

    // restore for later tests
    await db
      .update(schema.food)
      .set({ energyKcal: 128 })
      .where(sql`${schema.food.id} = ${arrozId}`);
  });

  it("editing the active diet publishes a new version", async () => {
    const edit = await studentDiets.editActive(ctxA, studentA);
    expect(edit.ok).toBe(true);
    // The draft clones the published tree.
    const state = await studentDiets.getStudentDietState(ctxA, studentA);
    expect(state!.draft!.isNewDiet).toBe(false);
    expect(state!.current!.version).toBe(1); // aluno still sees v1 while drafting

    const pub = await studentDiets.publishDraft(ctxA, studentA, mealPayload(300, "Cutting"));
    expect(pub).toMatchObject({ ok: true, version: 2 });

    const after = await studentDiets.getStudentDietState(ctxA, studentA);
    expect(after!.current!.version).toBe(2);
    expect(after!.current!.tree.meals[0].items[0].macros.energyKcal).toBeCloseTo(
      384,
    ); // 300 g arroz
    expect(after!.history[0].versions.map((v) => v.version)).toEqual([2, 1]);
  });

  it("only one draft at a time", async () => {
    await studentDiets.editActive(ctxA, studentA);
    const second = await studentDiets.editActive(ctxA, studentA);
    expect(second).toEqual({ ok: false, reason: "has_draft" });
    // clean up the draft
    await studentDiets.discardDraft(ctxA, studentA);
  });

  it("refuses to publish an empty diet", async () => {
    await studentDiets.editActive(ctxA, studentA);
    const res = await studentDiets.publishDraft(ctxA, studentA, {
      name: "Vazia",
      notes: null,
      meals: [],
    });
    expect(res).toEqual({ ok: false, reason: "empty" });
    await studentDiets.discardDraft(ctxA, studentA);
  });

  it("a new diet's first publish archives the previous active one", async () => {
    const created = await studentDiets.createBlankDraft(ctxA, studentA, "Bulking");
    expect(created.ok).toBe(true);
    // Old diet still active/current while the new one is a draft.
    let state = await studentDiets.getStudentDietState(ctxA, studentA);
    expect(state!.current!.dietName).toBe("Cutting");
    expect(state!.draft!.isNewDiet).toBe(true);

    await studentDiets.publishDraft(ctxA, studentA, mealPayload(100, "Bulking"));
    state = await studentDiets.getStudentDietState(ctxA, studentA);
    expect(state!.current!.dietName).toBe("Bulking");
    expect(state!.current!.version).toBe(1);
    // Two diets in history; the old one archived.
    expect(state!.history).toHaveLength(2);
    const cutting = state!.history.find((h) => h.dietName === "Cutting");
    expect(cutting!.status).toBe("archived");
  });

  it("discarding a brand-new draft removes it entirely", async () => {
    const before = await studentDiets.getStudentDietState(ctxA, studentA);
    await studentDiets.createBlankDraft(ctxA, studentA, "Temporária");
    expect(await studentDiets.discardDraft(ctxA, studentA)).toBe(true);
    const after = await studentDiets.getStudentDietState(ctxA, studentA);
    expect(after!.draft).toBeNull();
    expect(after!.current!.dietName).toBe(before!.current!.dietName);
    expect(after!.history).toHaveLength(before!.history.length);
  });

  it("saves the current diet as a reusable template", async () => {
    const res = await studentDiets.saveAsTemplate(ctxA, studentA);
    expect(res.ok).toBe(true);

    const list = await diets.listDiets(ctxA);
    expect(list.items.some((d) => d.name === "Bulking")).toBe(true);
  });

  it("is scoped to the clinic", async () => {
    // ctxB can't see clinic A's student.
    expect(await studentDiets.getStudentDietState(ctxB, studentA)).toBeNull();
    // ctxB can't create a diet for clinic A's student.
    const res = await studentDiets.createBlankDraft(ctxB, studentA, "hack");
    expect(res).toEqual({ ok: false, reason: "not_found" });
    // clinic B's own student starts empty.
    const empty = await studentDiets.getStudentDietState(ctxB, studentB);
    expect(empty).toEqual({
      activeDietId: null,
      current: null,
      draft: null,
      history: [],
    });
  });

  it("hard-deletes only an archived, unreferenced template", async () => {
    // A template referenced by a student diet (source) can't be deleted.
    const fromTemplate = await diets.createDiet(ctxA, {
      name: "Modelo referenciado",
      notes: null,
      meals: [
        {
          name: "R",
          time: null,
          items: [{ foodId: arrozId, grams: 50, substitutes: [] }],
        },
      ],
    });
    if (!fromTemplate.ok) throw new Error("setup failed");
    // no draft in flight now; assign it to the student (new draft diet).
    const assigned = await studentDiets.createFromTemplate(
      ctxA,
      studentA,
      fromTemplate.id,
    );
    expect(assigned.ok).toBe(true);

    await diets.archiveDiet(ctxA, fromTemplate.id);
    expect(await diets.deleteDiet(ctxA, fromTemplate.id)).toEqual({
      ok: false,
      reason: "in_use",
    });
    await studentDiets.discardDraft(ctxA, studentA);

    // An archived, unreferenced template deletes.
    const orphan = await diets.createDiet(ctxA, {
      name: "Órfã",
      notes: null,
      meals: [],
    });
    if (!orphan.ok) throw new Error("setup failed");
    expect(await diets.deleteDiet(ctxA, orphan.id)).toEqual({
      ok: false,
      reason: "not_archived",
    });
    await diets.archiveDiet(ctxA, orphan.id);
    expect(await diets.deleteDiet(ctxA, orphan.id)).toEqual({ ok: true });
  });

  it("deletes history versions one by one, never the aluno-visible one", async () => {
    const before = await studentDiets.getStudentDietState(ctxA, studentA);
    const currentEntry = before!.history.find(
      (h) => h.dietId === before!.activeDietId,
    )!;

    // The version the aluno is following is refused.
    expect(
      await studentDiets.deleteStudentDietVersion(
        ctxA,
        studentA,
        currentEntry.versions[0].versionId,
      ),
    ).toEqual({ ok: false, reason: "current" });

    const archived = before!.history.find((h) => h.status === "archived")!;
    expect(archived.versions).toHaveLength(2); // Cutting v2, v1

    // Another clinic can't delete it.
    expect(
      await studentDiets.deleteStudentDietVersion(
        ctxB,
        studentA,
        archived.versions[0].versionId,
      ),
    ).toEqual({ ok: false, reason: "not_found" });

    // One archived version goes on its own; the diet keeps the rest.
    expect(
      await studentDiets.deleteStudentDietVersion(
        ctxA,
        studentA,
        archived.versions[0].versionId,
      ),
    ).toEqual({ ok: true, deletedDiet: false });
    let state = await studentDiets.getStudentDietState(ctxA, studentA);
    expect(
      state!.history.find((h) => h.dietId === archived.dietId)!.versions,
    ).toHaveLength(1);

    // Deleting the last one takes the now-empty diet with it.
    expect(
      await studentDiets.deleteStudentDietVersion(
        ctxA,
        studentA,
        archived.versions[1].versionId,
      ),
    ).toEqual({ ok: true, deletedDiet: true });
    state = await studentDiets.getStudentDietState(ctxA, studentA);
    expect(state!.history.some((h) => h.dietId === archived.dietId)).toBe(false);
    // The aluno's current diet is untouched throughout.
    expect(state!.current!.dietName).toBe(before!.current!.dietName);
    expect(state!.current!.version).toBe(before!.current!.version);

    // A version that no longer exists is a plain not-found.
    expect(
      await studentDiets.deleteStudentDietVersion(
        ctxA,
        studentA,
        archived.versions[1].versionId,
      ),
    ).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("catalog substitutes are derived live on read", () => {
  it("shows a food's current catalog substitutes, reflecting later changes", async () => {
    // A fresh student so this doesn't disturb the shared studentA state.
    const [s] = await db
      .insert(schema.students)
      .values({
        clinicId: ctxA.clinicId,
        firstName: "Caio",
        lastName: "Dias",
        email: "caio@example.com",
      })
      .returning({ id: schema.students.id });
    const student = s.id;

    await studentDiets.createBlankDraft(ctxA, student, "Com subs");
    const pub = await studentDiets.publishDraft(
      ctxA,
      student,
      mealPayload(200, "Com subs"),
    );
    expect(pub).toMatchObject({ ok: true, version: 1 });

    // The arroz item shows its catalog substitute (batata), per-100 g grams.
    const state = await studentDiets.getStudentDietState(ctxA, student);
    const item = state!.current!.tree.meals[0].items[0];
    expect(item.foodSubstitutes).toEqual([
      { foodId: batataId, description: "Batata doce cozida", grams: 167 },
    ]);

    // Live: changing the catalog substitution reflects in the published version
    // with no re-publish.
    await db
      .update(schema.foodSubstitution)
      .set({ grams: 200 })
      .where(sql`${schema.foodSubstitution.foodId} = ${arrozId}`);
    const after = await studentDiets.getStudentDietState(ctxA, student);
    expect(after!.current!.tree.meals[0].items[0].foodSubstitutes).toEqual([
      { foodId: batataId, description: "Batata doce cozida", grams: 200 },
    ]);

    // restore for any later tests
    await db
      .update(schema.foodSubstitution)
      .set({ grams: 167 })
      .where(sql`${schema.foodSubstitution.foodId} = ${arrozId}`);
  });
});

/**
 * The dieta half of the same rule: an untouched draft closes without numbering a
 * version (its own student, so the counts above stay put).
 */
describe("publishing a diet draft that changed nothing", () => {
  let studentC: string;

  beforeAll(async () => {
    const [row] = await db
      .insert(schema.students)
      .values({
        clinicId: ctxA.clinicId,
        firstName: "Carla",
        lastName: "Dias",
        email: "carla-dieta@example.com",
      })
      .returning({ id: schema.students.id });
    studentC = row.id;
    await studentDiets.createBlankDraft(ctxA, studentC, "Cutting");
    await studentDiets.publishDraft(ctxA, studentC, mealPayload(200, "Cutting"));
  });

  it("closes the draft and leaves the published version standing", async () => {
    expect((await studentDiets.editActive(ctxA, studentC)).ok).toBe(true);
    const res = await studentDiets.publishDraft(
      ctxA,
      studentC,
      mealPayload(200, "Cutting"),
    );
    expect(res).toMatchObject({ ok: true, version: 1, unchanged: true });

    const state = await studentDiets.getStudentDietState(ctxA, studentC);
    expect(state!.current!.version).toBe(1);
    expect(state!.draft).toBeNull();
    const h = state!.history.find((d) => d.dietId === state!.current!.dietId)!;
    expect(h.versions).toHaveLength(1);
  });

  it("publishes when a portion actually changed", async () => {
    expect((await studentDiets.editActive(ctxA, studentC)).ok).toBe(true);
    const res = await studentDiets.publishDraft(
      ctxA,
      studentC,
      mealPayload(250, "Cutting"),
    );
    expect(res).toMatchObject({ ok: true, version: 2, unchanged: false });
  });
});
