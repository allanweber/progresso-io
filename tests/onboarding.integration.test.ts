// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { clinics } from "@/server/dal";
import {
  ensureClinicStarters,
  listClinicStarterKeys,
} from "@/server/dal/starters";
import type { TenantContext } from "@/server/tenant";

import { loadBaseCatalog } from "./starter-catalog";
import { createTestDb, type TestDb } from "./pglite";

/**
 * The setup guide's server side: a coach's selection is what gets imported, a
 * re-run is strictly additive, and the guide is marked done exactly once.
 *
 * These are the guarantees the wizard's UI leans on — that unticking a template
 * leaves it out, that ticking it later still works, and that nothing the coach
 * already edited is replaced or removed behind their back.
 */

let db: TestDb;
let h: DB;

async function makeClinic(userId: string, name: string): Promise<TenantContext> {
  await db
    .insert(schema.user)
    .values({ id: userId, name, email: `${userId}@example.com`, role: "coach" });
  const [c] = await db
    .insert(schema.clinic)
    .values({ name, ownerUserId: userId })
    .returning({ id: schema.clinic.id });
  await db
    .update(schema.user)
    .set({ clinicId: c.id })
    .where(eq(schema.user.id, userId));
  return { db: h, clinicId: c.id, userId, role: "coach" };
}

async function dietNames(clinicId: string): Promise<string[]> {
  const rows = await db
    .select({ name: schema.diet.name })
    .from(schema.diet)
    .where(eq(schema.diet.clinicId, clinicId));
  return rows.map((r) => r.name).sort();
}

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  await loadBaseCatalog(db);
});

describe("selective starter import", () => {
  it("imports only the ticked templates, in every domain", async () => {
    const ctx = await makeClinic("sel-owner", "Seletiva");

    const result = await ensureClinicStarters(h, ctx.clinicId, ctx.userId, {
      diets: ["emagrecimento", "low-carb"],
      workouts: ["abc-hipertrofia"],
      anamneses: ["hipertrofia"],
    });

    expect(result.seeded).toBe(true);
    expect(result.startersSeededAt).toBeInstanceOf(Date);
    expect(result.imported.diets.sort()).toEqual(["emagrecimento", "low-carb"]);
    expect(result.imported.workouts).toEqual(["abc-hipertrofia"]);
    expect(result.imported.anamneses).toEqual(["hipertrofia"]);

    const owned = await listClinicStarterKeys(h, ctx.clinicId);
    expect(owned.diets.sort()).toEqual(["emagrecimento", "low-carb"]);
    expect(owned.workouts).toEqual(["abc-hipertrofia"]);
    expect(owned.anamneses).toEqual(["hipertrofia"]);

    // The 11 unticked diets are genuinely absent, not hidden.
    expect(await dietNames(ctx.clinicId)).toHaveLength(2);
  });

  it("imports everything when a domain is left out — what skipping does", async () => {
    const ctx = await makeClinic("skip-owner", "Pulou o guia");

    const result = await ensureClinicStarters(h, ctx.clinicId, ctx.userId);

    expect(result.seeded).toBe(true);
    expect(result.imported.diets).toHaveLength(13);
    expect(result.imported.workouts).toHaveLength(11);
    expect(result.imported.anamneses).toHaveLength(6);
  });

  it("imports nothing for a domain the coach emptied", async () => {
    // An empty array is a real choice ("none of these"), not a missing field.
    const ctx = await makeClinic("empty-owner", "Sem modelos");

    const result = await ensureClinicStarters(h, ctx.clinicId, ctx.userId, {
      diets: [],
      workouts: [],
      anamneses: [],
    });

    expect(result.seeded).toBe(true);
    expect(result.imported).toEqual({ diets: [], workouts: [], anamneses: [] });
    expect(await dietNames(ctx.clinicId)).toEqual([]);
    // The clinic still counts as seeded, so the guide never re-fires on its own.
    expect(result.startersSeededAt).toBeInstanceOf(Date);
  });
});

describe("re-running the guide", () => {
  it("adds the newly ticked templates and leaves the rest alone", async () => {
    const ctx = await makeClinic("rerun-owner", "Re-run");
    await ensureClinicStarters(h, ctx.clinicId, ctx.userId, {
      diets: ["emagrecimento"],
      workouts: [],
      anamneses: [],
    });

    const second = await ensureClinicStarters(h, ctx.clinicId, ctx.userId, {
      diets: ["emagrecimento", "vegana"],
      workouts: ["forca-5x5"],
      anamneses: ["saude-da-mulher"],
    });

    // Only the new ones are imported — the flag stays at its first value.
    expect(second.seeded).toBe(false);
    expect(second.imported.diets).toEqual(["vegana"]);
    expect(second.imported.workouts).toEqual(["forca-5x5"]);
    expect(second.imported.anamneses).toEqual(["saude-da-mulher"]);

    const owned = await listClinicStarterKeys(h, ctx.clinicId);
    expect(owned.diets.sort()).toEqual(["emagrecimento", "vegana"]);
  });

  it("never duplicates a template the clinic already holds", async () => {
    const ctx = await makeClinic("dupe-owner", "Sem duplicatas");
    await ensureClinicStarters(h, ctx.clinicId, ctx.userId, {
      diets: ["hipertrofia"],
      workouts: [],
      anamneses: [],
    });
    await ensureClinicStarters(h, ctx.clinicId, ctx.userId, {
      diets: ["hipertrofia"],
      workouts: [],
      anamneses: [],
    });

    expect(await dietNames(ctx.clinicId)).toHaveLength(1);
  });

  it("never deletes or rewrites what is already there", async () => {
    // The guide is strictly additive: a coach who edited a starter and then came
    // back to add another must not lose their edit.
    const ctx = await makeClinic("edit-owner", "Editou");
    await ensureClinicStarters(h, ctx.clinicId, ctx.userId, {
      diets: ["emagrecimento"],
      workouts: [],
      anamneses: [],
    });
    await db
      .update(schema.diet)
      .set({ name: "Meu plano de corte" })
      .where(
        and(
          eq(schema.diet.clinicId, ctx.clinicId),
          eq(schema.diet.sourceKey, "emagrecimento"),
        ),
      );

    await ensureClinicStarters(h, ctx.clinicId, ctx.userId, {
      diets: ["emagrecimento", "vegana"],
      workouts: [],
      anamneses: [],
    });

    const names = await dietNames(ctx.clinicId);
    expect(names).toContain("Meu plano de corte");
    expect(names).toHaveLength(2);
  });

  it("unticking an imported template does not remove it", async () => {
    const ctx = await makeClinic("untick-owner", "Desmarcou");
    await ensureClinicStarters(h, ctx.clinicId, ctx.userId, {
      diets: ["emagrecimento"],
      workouts: [],
      anamneses: [],
    });

    await ensureClinicStarters(h, ctx.clinicId, ctx.userId, {
      diets: [],
      workouts: [],
      anamneses: [],
    });

    expect(await dietNames(ctx.clinicId)).toHaveLength(1);
  });
});

describe("completeOnboarding", () => {
  it("stamps the clinic and is reported as done", async () => {
    const ctx = await makeClinic("done-owner", "Concluiu");

    const [before] = await db
      .select({ at: schema.clinic.onboardingCompletedAt })
      .from(schema.clinic)
      .where(eq(schema.clinic.id, ctx.clinicId));
    expect(before.at).toBeNull();

    const at = await clinics.completeOnboarding(ctx);
    expect(at).toBeInstanceOf(Date);

    const settings = await clinics.getClinicSettings(ctx);
    expect(settings!.onboardingCompletedAt).toBe(at.toISOString());
  });

  it("keeps the original timestamp when the guide is re-run", async () => {
    // The column records when the clinic first got through the guide; a re-run
    // months later must not rewrite that history.
    const ctx = await makeClinic("stamp-owner", "Refez");
    const first = await clinics.completeOnboarding(ctx);
    const second = await clinics.completeOnboarding(ctx);

    expect(second.getTime()).toBe(first.getTime());
  });

  it("scopes the stamp to the caller's own clinic", async () => {
    const mine = await makeClinic("tenant-a", "Minha");
    const theirs = await makeClinic("tenant-b", "Outra");

    await clinics.completeOnboarding(mine);

    const [other] = await db
      .select({ at: schema.clinic.onboardingCompletedAt })
      .from(schema.clinic)
      .where(eq(schema.clinic.id, theirs.clinicId));
    expect(other.at).toBeNull();
  });
});
