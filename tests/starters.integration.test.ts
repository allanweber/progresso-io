// @vitest-environment node
import { and, eq, isNotNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { diets } from "@/server/dal";
import {
  ensureClinicStarters,
  importDietStartersToClinic,
  importWorkoutStartersToClinic,
} from "@/server/dal/starters";
import {
  hardDeleteDiet,
  listDietsAcrossClinics,
  listWorkoutsAcrossClinics,
} from "@/server/dal/admin";
import { STARTER_DIETS } from "@/server/diets/starter-templates";
import { STARTER_WORKOUTS } from "@/server/workouts/starter-templates";
import { STARTER_ANAMNESES } from "@/server/anamneses/starter-templates";
import type { TenantContext } from "@/server/tenant";

import { loadBaseCatalog } from "./starter-catalog";
import { createTestDb, type TestDb } from "./pglite";

let db: TestDb;
let clinicA: string;
let clinicB: string;

async function makeClinic(userId: string, name: string): Promise<string> {
  await db
    .insert(schema.user)
    .values({ id: userId, name, email: `${userId}@example.com` });
  const [c] = await db
    .insert(schema.clinic)
    .values({ name, ownerUserId: userId })
    .returning({ id: schema.clinic.id });
  await db
    .update(schema.user)
    .set({ clinicId: c.id })
    .where(eq(schema.user.id, userId));
  return c.id;
}

beforeAll(async () => {
  db = await createTestDb();
  await loadBaseCatalog(db);
  clinicA = await makeClinic("owner-a", "Clínica A");
  clinicB = await makeClinic("owner-b", "Clínica B");
});

describe("ensureClinicStarters", () => {
  it("seeds all three domains exactly once and stamps the flag", async () => {
    const r1 = await ensureClinicStarters(db as unknown as DB, clinicA, "owner-a");
    expect(r1.seeded).toBe(true);
    expect(r1.startersSeededAt).toBeInstanceOf(Date);

    const dietCount = await db
      .select({ id: schema.diet.id })
      .from(schema.diet)
      .where(
        and(eq(schema.diet.clinicId, clinicA), isNotNull(schema.diet.sourceKey)),
      );
    const workoutCount = await db
      .select({ id: schema.workout.id })
      .from(schema.workout)
      .where(
        and(
          eq(schema.workout.clinicId, clinicA),
          isNotNull(schema.workout.sourceKey),
        ),
      );
    const anamneseCount = await db
      .select({ id: schema.anamnesis.id })
      .from(schema.anamnesis)
      .where(eq(schema.anamnesis.clinicId, clinicA));

    // Every starter resolved and materialized — nothing dropped.
    expect(dietCount.length).toBe(STARTER_DIETS.length);
    expect(workoutCount.length).toBe(STARTER_WORKOUTS.length);
    expect(anamneseCount.length).toBe(STARTER_ANAMNESES.length);
  });

  it("is a no-op on the second call (runs exactly once)", async () => {
    const r2 = await ensureClinicStarters(db as unknown as DB, clinicA, "owner-a");
    expect(r2.seeded).toBe(false);

    // No duplicates: still exactly one copy of each starter.
    const diets2 = await db
      .select({ id: schema.diet.id })
      .from(schema.diet)
      .where(
        and(eq(schema.diet.clinicId, clinicA), isNotNull(schema.diet.sourceKey)),
      );
    expect(diets2.length).toBe(STARTER_DIETS.length);
  });

  it("hydrates a seeded diet with live macros from the catalog", async () => {
    const [row] = await db
      .select({ id: schema.diet.id })
      .from(schema.diet)
      .where(
        and(
          eq(schema.diet.clinicId, clinicA),
          eq(schema.diet.sourceKey, "hipertrofia"),
        ),
      );
    const ctx: TenantContext = {
      db: db as unknown as DB,
      clinicId: clinicA,
      userId: "owner-a",
      role: "coach",
    };
    const detail = await diets.getDiet(ctx, row.id);
    expect(detail).not.toBeNull();
    expect(detail!.meals.length).toBeGreaterThan(0);
    // Live nutrition computed from the referenced foods.
    expect(detail!.totals.energyKcal ?? 0).toBeGreaterThan(0);
    expect(detail!.totals.protein ?? 0).toBeGreaterThan(0);
  });

  it("concurrent first-load calls still seed exactly once", async () => {
    const [a, b, c] = await Promise.all([
      ensureClinicStarters(db as unknown as DB, clinicB, "owner-b"),
      ensureClinicStarters(db as unknown as DB, clinicB, "owner-b"),
      ensureClinicStarters(db as unknown as DB, clinicB, "owner-b"),
    ]);
    // At most one call reports it performed the seed.
    expect([a, b, c].filter((r) => r.seeded).length).toBeLessThanOrEqual(1);
    const dietCount = await db
      .select({ id: schema.diet.id })
      .from(schema.diet)
      .where(
        and(eq(schema.diet.clinicId, clinicB), isNotNull(schema.diet.sourceKey)),
      );
    expect(dietCount.length).toBe(STARTER_DIETS.length);
  });
});

describe("admin import + list + delete", () => {
  it("imports selected starters idempotently into a fresh clinic", async () => {
    const clinicC = await makeClinic("owner-c", "Clínica C");
    const keys = ["emagrecimento", "low-carb"];

    const first = await importDietStartersToClinic(
      db as unknown as DB,
      clinicC,
      keys,
    );
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.imported.sort()).toEqual([...keys].sort());

    // Re-import → all skipped (idempotent by source_key).
    const second = await importDietStartersToClinic(
      db as unknown as DB,
      clinicC,
      keys,
    );
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.imported).toEqual([]);
      expect(second.skipped.sort()).toEqual([...keys].sort());
    }

    const wk = await importWorkoutStartersToClinic(db as unknown as DB, clinicC, [
      "bro-split-5x",
    ]);
    expect(wk.ok).toBe(true);
    if (wk.ok) expect(wk.imported).toEqual(["bro-split-5x"]);
  });

  it("lists diets/workouts across clinics tagged by origin", async () => {
    const list = await listDietsAcrossClinics(db as unknown as DB, {
      origin: "system",
    });
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.every((i) => i.origin === "system")).toBe(true);
    expect(list.items.every((i) => i.sourceKey !== null)).toBe(true);

    const wlist = await listWorkoutsAcrossClinics(db as unknown as DB, {
      clinicId: clinicA,
    });
    expect(wlist.items.length).toBe(STARTER_WORKOUTS.length);
  });

  it("hard-deletes a diet cross-tenant", async () => {
    const [row] = await db
      .select({ id: schema.diet.id })
      .from(schema.diet)
      .where(eq(schema.diet.clinicId, clinicA))
      .limit(1);
    const ok = await hardDeleteDiet(db as unknown as DB, row.id);
    expect(ok).toBe(true);
    const [gone] = await db
      .select({ id: schema.diet.id })
      .from(schema.diet)
      .where(eq(schema.diet.id, row.id));
    expect(gone).toBeUndefined();
  });
});
