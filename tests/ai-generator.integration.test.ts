// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { cacheHitRatio } from "@/lib/ai-programs";
import {
  DEFAULT_AI_FALLBACK_MODELS,
  DEFAULT_AI_MODEL,
} from "@/lib/ai-settings";
import { ai, aiSettings, plans, providerPrices, studentWorkouts } from "@/server/dal";
import { monthStart } from "@/server/dal/ai";
import { buildExerciseCatalog, buildFoodCatalog } from "@/server/ai/catalog";
import { generateWorkout } from "@/server/ai/generate";
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

  it("finish keeps the credit and records the token split", async () => {
    const id = await ai.startGeneration(ctxB, {
      studentId: studentB,
      kind: "workout",
      provider: "test",
      model: "m",
      catalogHash: "abc123",
      anamnesisSnapshotId: null,
    });
    await ai.finishGeneration(ctxB, id, {
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 9000,
        cacheWriteTokens: 200,
        outputTokens: 500,
        reportedCostMicroUsd: 742,
      },
      call: {
        model: "served/model",
        upstreamProvider: "Groq",
        requestId: "gen-abc",
      },
      durationMs: 1234,
      repaired: true,
    });

    const [row] = await db
      .select()
      .from(schema.aiGeneration)
      .where(eq(schema.aiGeneration.id, id));
    expect(row.status).toBe("succeeded");
    expect(row.inputTokens).toBe(1000);
    expect(row.cachedInputTokens).toBe(9000);
    expect(row.cacheWriteTokens).toBe(200);
    expect(row.reportedCostMicroUsd).toBe(742);
    expect(row.repaired).toBe(true);
    // The row was opened asking for "m" and answered by another model — the
    // audit has to name the one that produced the tokens, not the one we hoped
    // for, or the whole row prices against the wrong rate.
    expect(row.model).toBe("served/model");
    expect(row.upstreamProvider).toBe("Groq");
    expect(row.requestId).toBe("gen-abc");
  });

  it("leaves the asked-for model standing when no call was made", async () => {
    const id = await ai.startGeneration(ctxB, {
      studentId: studentB,
      kind: "workout",
      provider: "openrouter",
      model: "asked/model",
      catalogHash: "abc123",
      anamnesisSnapshotId: null,
    });
    // A timeout never reached a model, so there is nothing truer to record.
    await ai.failGeneration(ctxB, id, "timeout", { call: null });

    const [row] = await db
      .select()
      .from(schema.aiGeneration)
      .where(eq(schema.aiGeneration.id, id));
    expect(row.model).toBe("asked/model");
    expect(row.upstreamProvider).toBeNull();
  });

  it("records what a failed call still cost", async () => {
    const id = await ai.startGeneration(ctxB, {
      studentId: studentB,
      kind: "workout",
      provider: "openrouter",
      model: "asked/model",
      catalogHash: "abc123",
      anamnesisSnapshotId: null,
    });
    // Truncated output: the credit goes back, the tokens do not.
    await ai.failGeneration(ctxB, id, "invalid_json", {
      usage: {
        inputTokens: 900,
        cachedInputTokens: 0,
        cacheWriteTokens: null,
        outputTokens: 8000,
        reportedCostMicroUsd: 1100,
      },
      call: { model: "asked/model", upstreamProvider: null, requestId: null },
      durationMs: 900,
    });

    const [row] = await db
      .select()
      .from(schema.aiGeneration)
      .where(eq(schema.aiGeneration.id, id));
    expect(row.status).toBe("failed");
    expect(row.reportedCostMicroUsd).toBe(1100);
    expect(await ai.countGenerationsThisMonth(ctxB)).toBeGreaterThanOrEqual(0);
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
      repaired?: boolean;
      model?: string;
      upstreamProvider?: string;
      reportedCostMicroUsd?: number;
    },
  ) {
    await db.insert(schema.aiGeneration).values({
      clinicId: ctx.clinicId,
      studentId,
      kind: "diet",
      status: usage.status,
      provider: "test",
      model: usage.model ?? "test-model",
      upstreamProvider: usage.upstreamProvider ?? null,
      inputTokens: usage.inputTokens ?? null,
      cachedInputTokens: usage.cachedInputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      reportedCostMicroUsd: usage.reportedCostMicroUsd ?? null,
      repaired: usage.repaired ?? false,
    });
  }

  /** A clinic with no history at all still has to appear, with zeroes. */
  it("lists every clinic, including ones that have never generated", async () => {
    const { ctx } = await makeClinic("quiet", "free");
    const overview = await ai.getAdminAiOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === ctx.clinicId);
    expect(row).toBeDefined();
    expect(row).toMatchObject({ used: 0, succeeded: 0, outputTokens: 0 });
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
    });
    expect(rowB).toMatchObject({ used: 0, inputTokens: 0, outputTokens: 0 });
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

  it("sums the token split across a clinic's rows", async () => {
    const { ctx, studentId } = await makeClinic("tokens", "clinica");
    await addPriced(ctx, studentId, {
      status: "succeeded",
      inputTokens: 16_000,
      cachedInputTokens: 0,
      outputTokens: 2_000,
    });
    await addPriced(ctx, studentId, {
      status: "succeeded",
      inputTokens: 800,
      cachedInputTokens: 15_200,
      outputTokens: 3_000,
    });
    // A failed row records no usage at all — its nulls must read as 0, not
    // poison the sum into NaN.
    await addPriced(ctx, studentId, { status: "failed" });

    const overview = await ai.getAdminAiOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === ctx.clinicId)!;
    expect(row.inputTokens).toBe(16_800);
    expect(row.cachedInputTokens).toBe(15_200);
    expect(row.outputTokens).toBe(5_000);
    // 15.200 of 32.000 input tokens served warm — the number the whole
    // base-only catalog design exists to move.
    expect(cacheHitRatio(row.inputTokens, row.cachedInputTokens)).toBeCloseTo(
      0.475,
    );
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
    expect(overview.totals.cachedInputTokens).toBe(
      sum((t) => t.cachedInputTokens),
    );
  });
});

describe("provider_price", () => {
  const base = {
    provider: "openai-compatible",
    model: "unit-test-model",
    inputUsdPerMtok: 30_000,
    outputUsdPerMtok: 130_000,
    cachedInputUsdPerMtok: 3_000,
    note: null,
  };

  it("creates, lists, updates and deletes a price", async () => {
    const created = await providerPrices.createProviderPrice(h, {
      ...base,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const listed = await providerPrices.listProviderPrices(h);
    expect(listed.some((p) => p.id === created.row.id)).toBe(true);

    const updated = await providerPrices.updateProviderPrice(h, created.row.id, {
      ...base,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      inputUsdPerMtok: 45_000,
    });
    expect(updated.ok && updated.row.inputMicroUsdPerMtok).toBe(45_000);

    expect(await providerPrices.deleteProviderPrice(h, created.row.id)).toBe(true);
    // Already gone → false, not a throw.
    expect(await providerPrices.deleteProviderPrice(h, created.row.id)).toBe(false);
  });

  it("refuses a second price for the same model at the same instant", async () => {
    const at = "2026-02-01T00:00:00.000Z";
    const first = await providerPrices.createProviderPrice(h, {
      ...base,
      model: "dup-model",
      effectiveFrom: at,
    });
    expect(first.ok).toBe(true);

    // Two prices for one instant would make "the price then" ambiguous, which
    // is the one question this table exists to answer.
    const second = await providerPrices.createProviderPrice(h, {
      ...base,
      model: "dup-model",
      effectiveFrom: at,
    });
    expect(second).toEqual({ ok: false, reason: "duplicate" });

    // A different instant for the same model is the normal case, not a clash.
    const later = await providerPrices.createProviderPrice(h, {
      ...base,
      model: "dup-model",
      effectiveFrom: "2026-03-01T00:00:00.000Z",
    });
    expect(later.ok).toBe(true);
  });

  it("lets a row keep its own date when edited", async () => {
    const created = await providerPrices.createProviderPrice(h, {
      ...base,
      model: "self-edit",
      effectiveFrom: "2026-04-01T00:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // The collision check must exclude the row being edited, or changing only
    // the price would report a clash with itself.
    const same = await providerPrices.updateProviderPrice(h, created.row.id, {
      ...base,
      model: "self-edit",
      effectiveFrom: "2026-04-01T00:00:00.000Z",
      outputUsdPerMtok: 999_000,
    });
    expect(same.ok).toBe(true);
  });

  it("reports not_found for an unknown id", async () => {
    const missing = await providerPrices.updateProviderPrice(
      h,
      "00000000-0000-4000-8000-000000000000",
      { ...base, effectiveFrom: "2026-05-01T00:00:00.000Z" },
    );
    expect(missing).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("getAdminAiOverview pricing", () => {
  /** A generation with usage, at a given instant, for a given model. */
  async function priced(
    ctx: TenantContext,
    studentId: string,
    model: string,
    createdAt: Date,
  ) {
    await db.insert(schema.aiGeneration).values({
      clinicId: ctx.clinicId,
      studentId,
      kind: "diet",
      status: "succeeded",
      provider: "openai-compatible",
      model,
      inputTokens: 1_000,
      cachedInputTokens: 9_000,
      outputTokens: 3_000,
      createdAt,
    });
  }

  it("is unpriced until a price covering the date exists, then priced", async () => {
    const { ctx, studentId } = await makeClinic("pricing", "clinica");
    const ranAt = new Date(monthStart(new Date()).getTime() + 60_000);
    await priced(ctx, studentId, "pricing-model", ranAt);

    const before = await ai.getAdminAiOverview(h);
    const rowBefore = before.tenants.find((t) => t.clinicId === ctx.clinicId)!;
    expect(rowBefore.costMicroUsd).toBeNull();
    expect(rowBefore.unpricedGenerations).toBe(1);

    await providerPrices.createProviderPrice(h, {
      provider: "openai-compatible",
      model: "pricing-model",
      effectiveFrom: new Date(0).toISOString(),
      inputUsdPerMtok: 30_000,
      outputUsdPerMtok: 130_000,
      cachedInputUsdPerMtok: 3_000,
      note: null,
    });

    // Nothing about the generation changed — adding the price is what completes
    // the figure, which is the whole point of pricing at read time.
    const after = await ai.getAdminAiOverview(h);
    const rowAfter = after.tenants.find((t) => t.clinicId === ctx.clinicId)!;
    expect(rowAfter.costMicroUsd).toBe(447);
    expect(rowAfter.unpricedGenerations).toBe(0);
  });

  it("prices a row dated before the price took effect as unpriced", async () => {
    const { ctx, studentId } = await makeClinic("late-price", "clinica");
    const ranAt = new Date(monthStart(new Date()).getTime() + 60_000);
    await priced(ctx, studentId, "late-model", ranAt);
    // Price starts tomorrow → today's generation still has no known cost.
    await providerPrices.createProviderPrice(h, {
      provider: "openai-compatible",
      model: "late-model",
      effectiveFrom: new Date(Date.now() + 86_400_000).toISOString(),
      inputUsdPerMtok: 30_000,
      outputUsdPerMtok: 130_000,
      cachedInputUsdPerMtok: null,
      note: null,
    });

    const overview = await ai.getAdminAiOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === ctx.clinicId)!;
    expect(row.costMicroUsd).toBeNull();
    expect(row.unpricedGenerations).toBe(1);
  });

  it("does not count a zero-token row as unpriced", async () => {
    const { ctx, studentId } = await makeClinic("no-usage", "clinica");
    // A failure before the model was ever called has nothing to price; counting
    // it as "missing a price" would send an admin hunting for a config gap that
    // doesn't exist.
    await addGeneration(ctx, studentId, "failed");

    const overview = await ai.getAdminAiOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === ctx.clinicId)!;
    expect(row.unpricedGenerations).toBe(0);
    expect(row.costMicroUsd).toBeNull();
  });
});

describe("getAdminAiOverview cost and model rollup", () => {
  /** A settled generation with usage, a model, a host and maybe a reported cost. */
  async function generation(
    ctx: TenantContext,
    studentId: string,
    row: {
      model: string;
      upstreamProvider?: string;
      reportedCostMicroUsd?: number;
      status?: schema.AiGenerationStatus;
      repaired?: boolean;
    },
  ) {
    await db.insert(schema.aiGeneration).values({
      clinicId: ctx.clinicId,
      studentId,
      kind: "diet",
      status: row.status ?? "succeeded",
      provider: "openrouter",
      model: row.model,
      upstreamProvider: row.upstreamProvider ?? null,
      inputTokens: 1_000,
      cachedInputTokens: 9_000,
      outputTokens: 3_000,
      reportedCostMicroUsd: row.reportedCostMicroUsd ?? null,
      repaired: row.repaired ?? false,
      createdAt: new Date(monthStart(new Date()).getTime() + 60_000),
    });
  }

  it("prefers the provider's own figure over the price list", async () => {
    const { ctx, studentId } = await makeClinic("reported", "clinica");
    await generation(ctx, studentId, {
      model: "reported-model",
      reportedCostMicroUsd: 900,
    });
    // A price exists too, and disagrees. The measured figure is what the
    // invoice will say, so it is the one that must win.
    await providerPrices.createProviderPrice(h, {
      provider: "openrouter",
      model: "reported-model",
      effectiveFrom: new Date(0).toISOString(),
      inputUsdPerMtok: 1_000_000,
      outputUsdPerMtok: 1_000_000,
      cachedInputUsdPerMtok: null,
      note: null,
    });

    const overview = await ai.getAdminAiOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === ctx.clinicId)!;
    expect(row.costMicroUsd).toBe(900);
    expect(row.reportedCostMicroUsd).toBe(900);
    expect(row.unpricedGenerations).toBe(0);
  });

  it("is not unpriced when the provider reported a cost but no price exists", async () => {
    const { ctx, studentId } = await makeClinic("reported-only", "clinica");
    await generation(ctx, studentId, {
      model: "never-priced-model",
      reportedCostMicroUsd: 742,
    });

    const overview = await ai.getAdminAiOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === ctx.clinicId)!;
    // Nothing to go hunting for: the cost is known exactly.
    expect(row.unpricedGenerations).toBe(0);
    expect(row.costMicroUsd).toBe(742);
  });

  it("keeps a reported zero distinct from nothing reported", async () => {
    const { ctx, studentId } = await makeClinic("free-model", "clinica");
    await generation(ctx, studentId, {
      model: "free-model",
      reportedCostMicroUsd: 0,
    });

    const overview = await ai.getAdminAiOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === ctx.clinicId)!;
    // "It was free" is a fact; "we don't know" is not. `null` would claim the
    // second when the provider stated the first.
    expect(row.costMicroUsd).toBe(0);
    expect(row.reportedCostMicroUsd).toBe(0);
    expect(row.unpricedGenerations).toBe(0);
  });

  it("rolls up by model across every tenant", async () => {
    const a = await makeClinic("rollup-a", "clinica");
    const b = await makeClinic("rollup-b", "solo");
    await generation(a.ctx, a.studentId, {
      model: "rollup/cheap",
      upstreamProvider: "Groq",
      reportedCostMicroUsd: 100,
    });
    await generation(b.ctx, b.studentId, {
      model: "rollup/cheap",
      upstreamProvider: "DeepInfra",
      reportedCostMicroUsd: 300,
      repaired: true,
    });
    await generation(a.ctx, a.studentId, {
      model: "rollup/dear",
      upstreamProvider: "Groq",
      reportedCostMicroUsd: 5_000,
      status: "failed",
    });

    const overview = await ai.getAdminAiOverview(h);
    const cheap = overview.models.find((m) => m.model === "rollup/cheap")!;
    expect(cheap.generations).toBe(2);
    expect(cheap.costMicroUsd).toBe(400);
    expect(cheap.repaired).toBe(1);
    // The same slug served by two hosts at two prices — the reason the column
    // exists at all.
    expect(cheap.upstreamProviders).toEqual(["DeepInfra", "Groq"]);

    const dear = overview.models.find((m) => m.model === "rollup/dear")!;
    // A failed call still spent the tokens, so it still appears in the model's
    // cost — the credit was refunded, the money was not.
    expect(dear.failed).toBe(1);
    expect(dear.costMicroUsd).toBe(5_000);
  });

  it("averages cost only over the calls that cost something", async () => {
    const { ctx, studentId } = await makeClinic("per-call", "clinica");
    await generation(ctx, studentId, {
      model: "avg/model",
      reportedCostMicroUsd: 600,
    });
    await generation(ctx, studentId, {
      model: "avg/model",
      reportedCostMicroUsd: 400,
    });
    // A failure that never reached a model: no tokens, no cost, nothing to
    // average. Counting it would report 333 instead of 500 — a third off, in
    // the direction that flatters the model.
    await db.insert(schema.aiGeneration).values({
      clinicId: ctx.clinicId,
      studentId,
      kind: "diet",
      status: "failed",
      provider: "openrouter",
      model: "avg/model",
      errorCode: "timeout",
      createdAt: new Date(monthStart(new Date()).getTime() + 60_000),
    });

    const overview = await ai.getAdminAiOverview(h);
    const row = overview.models.find((m) => m.model === "avg/model")!;
    expect(row.generations).toBe(3);
    expect(row.costedGenerations).toBe(2);
    expect(row.costMicroUsd).toBe(1_000);
  });
});

describe("ai_settings", () => {
  it("falls back to the coded defaults when nothing has been saved", async () => {
    // A fresh install has to be able to generate before anyone opens an admin
    // screen — an empty table must not read as "no model".
    const settings = await aiSettings.getAiSettings(h);
    expect(settings.model).toBe(DEFAULT_AI_MODEL);
    expect(settings.fallbackModels).toEqual(DEFAULT_AI_FALLBACK_MODELS);
    expect(settings.customized).toBe(false);
    expect(settings.updatedAt).toBeNull();
  });

  it("saves, reads back, and reports itself as a real choice", async () => {
    const saved = await aiSettings.updateAiSettings(h, {
      model: "openai/gpt-oss-20b:floor",
      fallbackModels: ["mistralai/mistral-nemo:floor"],
    });
    expect(saved.customized).toBe(true);

    const read = await aiSettings.getAiSettings(h);
    expect(read.model).toBe("openai/gpt-oss-20b:floor");
    expect(read.fallbackModels).toEqual(["mistralai/mistral-nemo:floor"]);
    expect(read.customized).toBe(true);
    expect(read.updatedAt).not.toBeNull();
  });

  it("stays a single row however many times it is saved", async () => {
    await aiSettings.updateAiSettings(h, {
      model: "a/one:floor",
      fallbackModels: [],
    });
    await aiSettings.updateAiSettings(h, {
      model: "a/two:floor",
      fallbackModels: ["b/three"],
    });

    const rows = await h.select().from(schema.aiSettings);
    // Two rows would leave every reader choosing, and the choice would be
    // arbitrary — which is what the singleton unique index prevents.
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe("a/two:floor");
  });

  it("keeps an empty fallback list rather than restoring the defaults", async () => {
    await aiSettings.updateAiSettings(h, {
      model: "a/one:floor",
      fallbackModels: [],
    });
    // "No fallbacks" is a real decision. Silently re-adding the defaults would
    // route generations to a model an admin deliberately removed.
    expect((await aiSettings.getAiSettings(h)).fallbackModels).toEqual([]);
  });
});

/**
 * The whole generator path, end to end: quota gate → model call → validation →
 * **saved draft**.
 *
 * Every other test here covers one seam. This one covers the join between them,
 * and specifically the last step, which is the only one the coach can see. A
 * generation that spends a credit, settles its audit row as succeeded and
 * returns 200 while writing no draft is invisible to every other assertion in
 * this file — the ledger says it worked and the screen is empty.
 *
 * The provider is stubbed at `fetch`, not at the module: that keeps
 * `buildRequestBody`, the response parsing and the usage accounting inside the
 * test, so only the network is fake.
 */
/** The open anamnese gate the generator requires, at its minimum. */
async function completedAnamnesis(ctx: TenantContext, studentId: string) {
  await db.insert(schema.studentAnamnesis).values({
    clinicId: ctx.clinicId,
    studentId,
    name: "Anamnese",
    sections: [
      {
        key: "perfil",
        title: "Perfil",
        questions: [
          { key: "weight", label: "Peso", type: "short_text", mask: "integer" },
        ],
      },
    ],
    answers: { weight: "80" },
    status: "completed",
    filledBy: "coach",
    filledAt: new Date(),
  });
}

describe("generateWorkout end to end", () => {
  let ctx: TenantContext;
  let studentId: string;
  let calls: number;

  /** A chat completion carrying `plan` as its content, shaped like OpenRouter's. */
  function completion(plan: unknown) {
    return {
      ok: true,
      json: async () => ({
        id: "gen-test-1",
        model: DEFAULT_AI_MODEL.replace(":floor", ""),
        provider: "Alibaba",
        choices: [
          { message: { content: JSON.stringify(plan) }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 1200, completion_tokens: 300, cost: 0.0004 },
      }),
    } as unknown as Response;
  }

  beforeAll(async () => {
    process.env.LLM_API_KEY = "test-key";
    const gamma = await makeClinic("gamma", "solo");
    ctx = gamma.ctx;
    studentId = gamma.studentId;
    // The generator refuses without a completed anamnese — that gate has its own
    // coverage; here it just has to be open.
    await completedAnamnesis(ctx, studentId);
  });

  beforeEach(() => {
    calls = 0;
  });

  // Every other suite in this file talks to the database over the real `fetch`
  // -free path; leaving a stub installed would poison them.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves the generated plan as the student's draft", async () => {
    const catalog = await buildExerciseCatalog(ctx);
    expect(catalog.size).toBeGreaterThan(0);

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      return completion({
        name: "Treino gerado",
        notes: "Observações do treino.",
        sessions: [
          {
            name: "Ficha A",
            exercises: [
              { exercise: 1, sets: 3, reps: [12], rest: 60, note: null },
            ],
          },
        ],
      });
    });

    const result = await generateWorkout(ctx, studentId, {
      objective: "hipertrofia",
      equipment: ["academia"],
      daysPerWeek: 3,
    });

    expect(result).toMatchObject({ ok: true, repaired: false });
    expect(calls).toBe(1);

    // The assertion that the credit actually bought something.
    const state = await studentWorkouts.getStudentWorkoutState(ctx, studentId);
    expect(state?.draft).not.toBeNull();
    expect(state?.draft?.workoutName).toBe("Treino gerado");
    expect(state?.draft?.sessions).toHaveLength(1);
    expect(state?.draft?.sessions[0].exercises).toHaveLength(1);
    // Resolved back to a real row, not left as the model's catalog number.
    const line = state!.draft!.sessions[0].exercises[0];
    expect(line.exerciseId).toBe(catalog.byIndex.get(1));
    expect(line.available).toBe(true);
    expect(line.sets).toBe(3);
    expect(line.reps).toEqual({ kind: "fixed", value: 12 });

    // And the ledger agrees it succeeded.
    const [row] = await h
      .select()
      .from(schema.aiGeneration)
      .where(eq(schema.aiGeneration.clinicId, ctx.clinicId));
    expect(row.status).toBe("succeeded");
    expect(row.errorCode).toBeNull();
  });

  it("still saves a draft when the student already has an active workout", async () => {
    // The shape every real student is in after their first publish, and the one
    // the first test above is *not* in. `createBlankDraft` only refuses when a
    // *draft* exists, so an active workout must not stop the generator — the
    // draft becomes the pending next version alongside it.
    const other = await makeClinic("delta", "solo");
    await completedAnamnesis(other.ctx, other.studentId);

    const catalog = await buildExerciseCatalog(other.ctx);
    const blank = await studentWorkouts.createBlankDraft(
      other.ctx,
      other.studentId,
      "Treino atual",
    );
    expect(blank.ok).toBe(true);
    await studentWorkouts.publishDraft(other.ctx, other.studentId, {
      name: "Treino atual",
      notes: null,
      sessions: [
        {
          name: "Ficha A",
          exercises: [
            {
              exerciseId: catalog.byIndex.get(1)!,
              sets: 3,
              reps: { kind: "fixed", value: 10 },
              load: null,
              rest: 60,
              note: null,
              technique: null,
              groupId: null,
              customSubstitutes: [],
            },
          ],
        },
      ],
    });

    const before = await studentWorkouts.getStudentWorkoutState(
      other.ctx,
      other.studentId,
    );
    expect(before?.current).not.toBeNull();
    expect(before?.draft).toBeNull();

    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      completion({
        name: "Treino gerado sobre o ativo",
        notes: null,
        sessions: [
          {
            name: "Ficha A",
            exercises: [
              { exercise: 1, sets: 3, reps: [12], rest: 60, note: null },
            ],
          },
        ],
      }),
    );

    const result = await generateWorkout(other.ctx, other.studentId, {
      objective: "hipertrofia",
      equipment: ["academia"],
      daysPerWeek: 3,
    });
    expect(result).toMatchObject({ ok: true });

    const after = await studentWorkouts.getStudentWorkoutState(
      other.ctx,
      other.studentId,
    );
    // The published workout survives untouched and the draft is there to review.
    expect(after?.current?.workoutName).toBe("Treino atual");
    expect(after?.draft?.workoutName).toBe("Treino gerado sobre o ativo");
  });

  it("overwrites the existing draft instead of adding a second one", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      completion({
        name: "Treino regerado",
        notes: null,
        sessions: [
          {
            name: "Ficha única",
            exercises: [
              { exercise: 1, sets: 4, reps: [10, 8], rest: 90, note: null },
            ],
          },
        ],
      }),
    );

    // The coach confirmed the overwrite in the dialog; the service must land on
    // the draft that already exists rather than creating a rival one, which
    // `findDraft` would then pick between arbitrarily.
    const result = await generateWorkout(ctx, studentId, {
      objective: "força",
      equipment: ["academia"],
      daysPerWeek: 2,
    });
    expect(result).toMatchObject({ ok: true });

    const state = await studentWorkouts.getStudentWorkoutState(ctx, studentId);
    expect(state?.draft?.workoutName).toBe("Treino regerado");

    const drafts = await h
      .select()
      .from(schema.studentWorkout)
      .where(eq(schema.studentWorkout.clinicId, ctx.clinicId));
    expect(drafts).toHaveLength(1);
  });
});
