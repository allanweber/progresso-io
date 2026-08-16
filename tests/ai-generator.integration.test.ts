// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { ai, plans } from "@/server/dal";
import { monthStart } from "@/server/dal/ai";
import { buildExerciseCatalog, buildFoodCatalog } from "@/server/ai/catalog";
import type { TenantContext } from "@/server/tenant";

import { clearTrial, createTestDb, type TestDb } from "./pglite";

/**
 * Integration tests for the parts that only fail against a real database: the
 * quota window, tenant isolation, credit release, and the catalog block's
 * stability guarantees.
 *
 * The catalog assertions matter more than they look. A shuffled prefix produces
 * **no error** — just a silently cold cache, a slower request and a bigger bill.
 * These are the only thing that would catch it.
 */

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let h: DB;
let ctxA: TenantContext;
let ctxB: TenantContext;
let studentA: string;
let studentB: string;

/**
 * Clinics are created through real sign-up: `clinic.owner_user_id` is NOT NULL
 * and user↔clinic is circular, so the bootstrap hook is the only sane path in.
 */
async function makeClinic(
  name: string,
  plan: schema.Plan,
): Promise<{ ctx: TenantContext; studentId: string }> {
  const email = `${name}@example.com`;
  await auth.api.signUpEmail({
    body: { name, email, password: "supersegura123" },
  });
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email));
  const clinicId = user.clinicId!;
  await db
    .update(schema.clinic)
    .set({ plan })
    .where(eq(schema.clinic.id, clinicId));
  // These assertions are about PLAN allowances, so drop the sign-up trial —
  // otherwise every clinic reads as Solo regardless of its stored plan.
  await clearTrial(db, clinicId);

  const [student] = await db
    .insert(schema.students)
    .values({ clinicId, firstName: "Aluno", lastName: name, modality: "online" })
    .returning({ id: schema.students.id });
  return {
    ctx: { db: h, clinicId, userId: user.id, role: "coach" },
    studentId: student.id,
  };
}

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });
  const a = await makeClinic("alpha", "solo");
  const b = await makeClinic("beta", "solo");
  ctxA = a.ctx;
  ctxB = b.ctx;
  studentA = a.studentId;
  studentB = b.studentId;
});

/** Writes a settled generation row directly, bypassing the service. */
async function addGeneration(
  ctx: TenantContext,
  studentId: string,
  status: schema.AiGenerationStatus,
  createdAt?: Date,
) {
  const [row] = await db
    .insert(schema.aiGeneration)
    .values({
      clinicId: ctx.clinicId,
      studentId,
      kind: "workout",
      status,
      provider: "test",
      model: "test-model",
      ...(createdAt ? { createdAt } : {}),
    })
    .returning({ id: schema.aiGeneration.id });
  return row.id;
}

describe("monthStart", () => {
  it("is midnight on the 1st in São Paulo, not UTC", () => {
    // 2026-03-01T02:00Z is still 2026-02-28 23:00 in São Paulo (UTC−3), so the
    // February window must still be the current one.
    const start = monthStart(new Date("2026-03-01T02:00:00Z"));
    expect(start.toISOString()).toBe("2026-02-01T03:00:00.000Z");
  });

  it("rolls over at 03:00Z on the 1st", () => {
    const start = monthStart(new Date("2026-03-01T03:30:00Z"));
    expect(start.toISOString()).toBe("2026-03-01T03:00:00.000Z");
  });
});

describe("countGenerationsThisMonth", () => {
  it("counts pending and succeeded, but not failed", async () => {
    await addGeneration(ctxA, studentA, "succeeded");
    await addGeneration(ctxA, studentA, "pending");
    await addGeneration(ctxA, studentA, "failed");
    // A failure costs the provider's time, not the coach's credit.
    expect(await ai.countGenerationsThisMonth(ctxA)).toBe(2);
  });

  it("ignores rows from a previous month", async () => {
    await addGeneration(
      ctxA,
      studentA,
      "succeeded",
      new Date("2020-01-15T12:00:00Z"),
    );
    expect(await ai.countGenerationsThisMonth(ctxA)).toBe(2);
  });

  it("is scoped to the clinic", async () => {
    // Clinic B has its own rows; neither clinic sees the other's.
    await addGeneration(ctxB, studentB, "succeeded");
    expect(await ai.countGenerationsThisMonth(ctxA)).toBe(2);
    expect(await ai.countGenerationsThisMonth(ctxB)).toBe(1);
  });
});

describe("generation lifecycle", () => {
  it("start claims a credit and fail releases it", async () => {
    const before = await ai.countGenerationsThisMonth(ctxB);

    const id = await ai.startGeneration(ctxB, {
      studentId: studentB,
      kind: "diet",
      provider: "test",
      model: "m",
      catalogHash: "abc123",
      anamnesisSnapshotId: null,
    });
    // Pending already counts — that's what stops two concurrent requests from
    // both slipping under the cap.
    expect(await ai.countGenerationsThisMonth(ctxB)).toBe(before + 1);

    await ai.failGeneration(ctxB, id, "timeout");
    expect(await ai.countGenerationsThisMonth(ctxB)).toBe(before);
  });

  it("finish keeps the credit and records the frozen cost", async () => {
    const id = await ai.startGeneration(ctxB, {
      studentId: studentB,
      kind: "workout",
      provider: "test",
      model: "m",
      catalogHash: "abc123",
      anamnesisSnapshotId: null,
    });
    await ai.finishGeneration(ctxB, id, {
      usage: { inputTokens: 1000, cachedInputTokens: 9000, outputTokens: 500 },
      costMicroUsd: 447,
      durationMs: 1234,
      repaired: true,
    });

    const [row] = await db
      .select()
      .from(schema.aiGeneration)
      .where(eq(schema.aiGeneration.id, id));
    expect(row.status).toBe("succeeded");
    expect(row.costMicroUsd).toBe(447);
    expect(row.cachedInputTokens).toBe(9000);
    expect(row.repaired).toBe(true);
  });

  it("cannot settle another clinic's row", async () => {
    const id = await ai.startGeneration(ctxA, {
      studentId: studentA,
      kind: "workout",
      provider: "test",
      model: "m",
      catalogHash: "h",
      anamnesisSnapshotId: null,
    });
    // Clinic B tries to fail clinic A's generation — the where clause is scoped
    // by clinicId, so nothing happens.
    await ai.failGeneration(ctxB, id, "timeout");
    const [row] = await db
      .select()
      .from(schema.aiGeneration)
      .where(eq(schema.aiGeneration.id, id));
    expect(row.status).toBe("pending");
  });

  it("hasPendingGeneration is per student and per kind", async () => {
    expect(await ai.hasPendingGeneration(ctxA, studentA, "workout")).toBe(true);
    expect(await ai.hasPendingGeneration(ctxA, studentA, "diet")).toBe(false);
    expect(await ai.hasPendingGeneration(ctxB, studentB, "workout")).toBe(false);
  });
});

describe("plan limits", () => {
  it("resolves the seeded per-plan allowance", async () => {
    // Migration 0031 backfills these; Solo is 10.
    expect(await plans.getAiGenerationLimit(ctxA)).toBe(10);
  });

  it("a per-clinic override wins over the plan", async () => {
    await db
      .update(schema.clinic)
      .set({ aiGenerationsOverride: 3 })
      .where(eq(schema.clinic.id, ctxA.clinicId));
    expect(await plans.getAiGenerationLimit(ctxA)).toBe(3);
  });

  it("an override of 0 switches the feature off", async () => {
    await db
      .update(schema.clinic)
      .set({ aiGenerationsOverride: 0 })
      .where(eq(schema.clinic.id, ctxA.clinicId));
    expect(await plans.getAiGenerationLimit(ctxA)).toBe(0);
  });

  it("enterprise resolves to unlimited, not to the coded default", async () => {
    await db
      .update(schema.clinic)
      .set({ plan: "enterprise", aiGenerationsOverride: null })
      .where(eq(schema.clinic.id, ctxA.clinicId));
    // The plan_limit row exists with a NULL — that means unlimited, and must not
    // be confused with "no row", which falls back to the coded default.
    expect(await plans.getAiGenerationLimit(ctxA)).toBeNull();
  });
});

describe("catalog block", () => {
  beforeAll(async () => {
    // Two base exercises whose alphabetical name order differs from code order,
    // so an accidental ORDER BY name would be visible.
    await db.insert(schema.exercise).values([
      {
        code: "b_squat",
        name: "Agachamento",
        searchText: "agachamento",
        category: "strength",
        level: "beginner",
        equipment: "barbell",
        primaryMuscles: ["quadriceps"],
        secondaryMuscles: [],
        instructions: [],
        images: [],
      },
      {
        code: "a_bench",
        name: "Supino",
        searchText: "supino",
        category: "strength",
        level: "beginner",
        equipment: "barbell",
        primaryMuscles: ["chest"],
        secondaryMuscles: [],
        instructions: [],
        images: [],
      },
    ]);
    const [group] = await db
      .insert(schema.foodGroup)
      .values({ name: "Cereais", slug: "cereais" })
      .returning({ id: schema.foodGroup.id });
    await db.insert(schema.food).values([
      {
        code: "1",
        description: "Arroz integral cozido",
        searchText: "arroz integral cozido",
        groupId: group.id,
        type: "ingrediente",
        energyKcal: 124,
        protein: 2.6,
        carbohydrate: 25.8,
        fat: 1,
      },
      {
        // Unmeasured macros — must not reach the model.
        code: "2",
        description: "Alimento sem macros",
        searchText: "alimento sem macros",
        groupId: group.id,
        type: "ingrediente",
        energyKcal: null,
        protein: null,
        carbohydrate: null,
        fat: null,
      },
      {
        // Ambiguous duplicate — must not reach the model either.
        code: "3",
        description: "Arroz integral cozido",
        searchText: "arroz integral cozido",
        groupId: group.id,
        type: "ingrediente",
        energyKcal: 124,
        protein: 2.6,
        carbohydrate: 25.8,
        fat: 1,
        needsReview: true,
      },
    ]);
  });

  it("orders by code, not by name", async () => {
    const block = await buildExerciseCatalog(ctxA);
    // a_bench sorts before b_squat, so Supino must come first even though
    // "Agachamento" is alphabetically earlier.
    expect(block.text.split("\n")[0]).toContain("Supino");
    expect(block.text.split("\n")[1]).toContain("Agachamento");
  });

  it("is byte-identical across calls — the cache depends on it", async () => {
    const a = await buildExerciseCatalog(ctxA);
    const b = await buildExerciseCatalog(ctxA);
    expect(a.text).toBe(b.text);
    expect(a.hash).toBe(b.hash);
  });

  it("is identical for two different clinics — one global prefix", async () => {
    // This is the whole reason the catalog is base-only: a per-clinic block
    // would never hit the provider's prompt cache.
    const a = await buildExerciseCatalog(ctxA);
    const b = await buildExerciseCatalog(ctxB);
    expect(a.hash).toBe(b.hash);
  });

  it("maps 1-based indices back to real exercise ids", async () => {
    const block = await buildExerciseCatalog(ctxA);
    const first = block.byIndex.get(1)!;
    const [row] = await db
      .select({ name: schema.exercise.name })
      .from(schema.exercise)
      .where(eq(schema.exercise.id, first));
    expect(row.name).toBe("Supino");
  });

  it("drops foods with unknown macros and needsReview duplicates", async () => {
    const block = await buildFoodCatalog(ctxA);
    expect(block.text).toContain("Arroz integral cozido");
    expect(block.text).not.toContain("Alimento sem macros");
    // Only one of the two identically-named rows survives.
    expect(block.size).toBe(1);
  });

  it("excludes a clinic's own custom rows from the shared prefix", async () => {
    const before = await buildExerciseCatalog(ctxA);
    await db.insert(schema.exercise).values({
      clinicId: ctxA.clinicId,
      code: null,
      name: "Exercício da clínica",
      searchText: "exercicio da clinica",
      category: "strength",
      level: "beginner",
      primaryMuscles: ["chest"],
      secondaryMuscles: [],
      instructions: [],
      images: [],
    });
    const after = await buildExerciseCatalog(ctxA);
    // A clinic-custom exercise must never enter the global prefix — it would
    // both break the shared cache and leak across tenants.
    expect(after.hash).toBe(before.hash);
    expect(after.text).not.toContain("Exercício da clínica");
  });

  it("changes the hash when a base row is archived", async () => {
    const before = await buildExerciseCatalog(ctxA);
    await db
      .update(schema.exercise)
      .set({ archived: true })
      .where(eq(schema.exercise.code, "a_bench"));
    const after = await buildExerciseCatalog(ctxA);
    // The hash is the cache-observability signal: when the set changes, it must
    // change too, so a cold cache is explainable rather than mysterious.
    expect(after.hash).not.toBe(before.hash);
  });
});

describe("getAdminAiOverview", () => {
  /** Writes a settled row with usage numbers on it. */
  async function addPriced(
    ctx: TenantContext,
    studentId: string,
    usage: {
      status: schema.AiGenerationStatus;
      inputTokens?: number;
      cachedInputTokens?: number;
      outputTokens?: number;
      costMicroUsd?: number | null;
      repaired?: boolean;
    },
  ) {
    await db.insert(schema.aiGeneration).values({
      clinicId: ctx.clinicId,
      studentId,
      kind: "diet",
      status: usage.status,
      provider: "test",
      model: "test-model",
      inputTokens: usage.inputTokens ?? null,
      cachedInputTokens: usage.cachedInputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      costMicroUsd: usage.costMicroUsd ?? null,
      repaired: usage.repaired ?? false,
    });
  }

  /** A clinic with no history at all still has to appear, with zeroes. */
  it("lists every clinic, including ones that have never generated", async () => {
    const { ctx } = await makeClinic("quiet", "free");
    const overview = await ai.getAdminAiOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === ctx.clinicId);
    expect(row).toBeDefined();
    expect(row).toMatchObject({ used: 0, succeeded: 0, costMicroUsd: null });
    // Free's coded default, not "unlimited" — an absent number here would read
    // as an uncapped clinic on the screen.
    expect(row!.limit).toBe(1);
  });

  it("keeps each clinic's usage to itself", async () => {
    const a = await makeClinic("iso-a", "clinica");
    const b = await makeClinic("iso-b", "clinica");
    await addPriced(a.ctx, a.studentId, {
      status: "succeeded",
      inputTokens: 1_000,
      cachedInputTokens: 9_000,
      outputTokens: 3_000,
      costMicroUsd: 447,
    });

    const overview = await ai.getAdminAiOverview(h);
    const rowA = overview.tenants.find((t) => t.clinicId === a.ctx.clinicId)!;
    const rowB = overview.tenants.find((t) => t.clinicId === b.ctx.clinicId)!;
    expect(rowA).toMatchObject({
      used: 1,
      succeeded: 1,
      inputTokens: 1_000,
      cachedInputTokens: 9_000,
      outputTokens: 3_000,
      costMicroUsd: 447,
    });
    expect(rowB).toMatchObject({ used: 0, costMicroUsd: null });
  });

  it("counts pending as billed and failed as free — matching the gate", async () => {
    const { ctx, studentId } = await makeClinic("mix", "clinica");
    await addPriced(ctx, studentId, { status: "succeeded" });
    await addPriced(ctx, studentId, { status: "pending" });
    await addPriced(ctx, studentId, { status: "failed" });

    const overview = await ai.getAdminAiOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === ctx.clinicId)!;
    // `used` must agree with `countGenerationsThisMonth`, or the admin screen
    // and the coach's own counter would tell different stories.
    expect(row.used).toBe(2);
    expect(row.succeeded).toBe(1);
    expect(row.failed).toBe(1);
    expect(row.used).toBe(await ai.countGenerationsThisMonth(ctx));
  });

  it("reports how much of a cost total is missing rather than under-stating it", async () => {
    const { ctx, studentId } = await makeClinic("partial", "clinica");
    await addPriced(ctx, studentId, { status: "succeeded", costMicroUsd: 500 });
    await addPriced(ctx, studentId, { status: "succeeded", costMicroUsd: null });
    // A pending row has not been costed *yet*; that is not the same as having
    // run with no tariff, so it must not inflate the "missing" count.
    await addPriced(ctx, studentId, { status: "pending", costMicroUsd: null });

    const overview = await ai.getAdminAiOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === ctx.clinicId)!;
    expect(row.costMicroUsd).toBe(500);
    expect(row.unpricedGenerations).toBe(1);
  });

  it("ignores rows from before the current month", async () => {
    const { ctx, studentId } = await makeClinic("lastmonth", "clinica");
    const before = new Date(monthStart(new Date()).getTime() - 60_000);
    await addGeneration(ctx, studentId, "succeeded", before);

    const overview = await ai.getAdminAiOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === ctx.clinicId)!;
    expect(row.used).toBe(0);
  });

  it("gives a trialing free clinic the trial plan's allowance", async () => {
    const email = "trialing@example.com";
    await auth.api.signUpEmail({
      body: { name: "trialing", email, password: "supersegura123" },
    });
    const [user] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, email));
    // Sign-up leaves the clinic on `free` with a live trial — deliberately NOT
    // cleared here, unlike every other fixture in this file.
    const overview = await ai.getAdminAiOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === user.clinicId)!;
    expect(row.plan).toBe("free");
    expect(row.effectivePlan).toBe("solo");
    expect(row.limit).toBe(10); // Solo's, not Free's 1
  });

  it("flags clinics that have spent their whole allowance", async () => {
    const { ctx, studentId } = await makeClinic("capped", "free");
    const beforeCount = (await ai.getAdminAiOverview(h)).totals.clinicsAtLimit;
    await addPriced(ctx, studentId, { status: "succeeded" }); // Free = 1

    const overview = await ai.getAdminAiOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === ctx.clinicId)!;
    expect(row.used).toBe(1);
    expect(row.limit).toBe(1);
    expect(overview.totals.clinicsAtLimit).toBe(beforeCount + 1);
  });

  it("totals agree with the sum of the rows", async () => {
    const overview = await ai.getAdminAiOverview(h);
    const sum = (pick: (t: (typeof overview.tenants)[number]) => number) =>
      overview.tenants.reduce((s, t) => s + pick(t), 0);
    expect(overview.totals.generations).toBe(sum((t) => t.used));
    expect(overview.totals.outputTokens).toBe(sum((t) => t.outputTokens));
    expect(overview.totals.unpricedGenerations).toBe(
      sum((t) => t.unpricedGenerations),
    );
  });
});
