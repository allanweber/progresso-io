// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { admin } from "@/server/dal";
import { seedClinicAnamneses } from "@/server/dal/anamneses";
import { STARTER_ANAMNESES } from "@/server/anamneses/starter-templates";

import { createTestDb, type TestDb } from "./pglite";

/**
 * The admin anamnese-maintenance DAL: a cross-clinic listing tagged by
 * provenance (source_key), an idempotent starter import, and a hard delete that
 * preserves filled student snapshots.
 */

let db: TestDb;
let clinicA: string;
let clinicB: string;
let starterAnamnesisId: string;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(schema.user).values([
    { id: "owner-a", name: "Owner A", email: "oa@example.com" },
    { id: "owner-b", name: "Owner B", email: "ob@example.com" },
  ]);
  const [a] = await db
    .insert(schema.clinic)
    .values({ name: "Alpha Clinic", ownerUserId: "owner-a" })
    .returning();
  const [b] = await db
    .insert(schema.clinic)
    .values({ name: "Beta Clinic", ownerUserId: "owner-b" })
    .returning();
  clinicA = a.id;
  clinicB = b.id;

  // Clinic A: seeded starters (source_key set) + one coach-authored anamnese.
  await seedClinicAnamneses(db as unknown as DB, clinicA, "owner-a");
  await db.insert(schema.anamnesis).values({
    clinicId: clinicA,
    coachId: "owner-a",
    name: "Minha anamnese personalizada",
    objective: "health",
    modality: "any",
    sections: [],
  });

  // A student assigned from one starter (to exercise usage count + set-null).
  const [starter] = await db
    .select({ id: schema.anamnesis.id })
    .from(schema.anamnesis)
    .where(eq(schema.anamnesis.sourceKey, "hipertrofia"));
  starterAnamnesisId = starter.id;
  const [student] = await db
    .insert(schema.students)
    .values({ clinicId: clinicA, firstName: "Ana", lastName: "Aluna" })
    .returning();
  await db.insert(schema.studentAnamnesis).values({
    clinicId: clinicA,
    studentId: student.id,
    sourceAnamnesisId: starterAnamnesisId,
    name: "Anamnese — Hipertrofia / Ganho de massa",
    sections: [],
    status: "completed",
  });
});

describe("admin anamnese DAL", () => {
  it("seedClinicAnamneses stamps source_key", async () => {
    const rows = await db
      .select({ sourceKey: schema.anamnesis.sourceKey })
      .from(schema.anamnesis)
      .where(eq(schema.anamnesis.clinicId, clinicA));
    const systemCount = rows.filter((r) => r.sourceKey !== null).length;
    expect(systemCount).toBe(STARTER_ANAMNESES.length);
  });

  it("lists across clinics with clinic name, origin and usage count", async () => {
    const all = await admin.listAnamnesesAcrossClinics(db as unknown as DB, {
      pageSize: 100,
    });
    // Alpha's starters + the coach one (Beta has none yet).
    expect(all.total).toBe(STARTER_ANAMNESES.length + 1);
    expect(all.items.every((i) => i.clinicName === "Alpha Clinic")).toBe(true);

    const coach = all.items.find((i) => i.sourceKey === null);
    expect(coach?.name).toBe("Minha anamnese personalizada");

    const hyper = all.items.find((i) => i.sourceKey === "hipertrofia");
    expect(hyper?.studentUsageCount).toBe(1);
  });

  it("filters by origin and clinic", async () => {
    const system = await admin.listAnamnesesAcrossClinics(db as unknown as DB, {
      origin: "system",
      pageSize: 100,
    });
    expect(system.items.every((i) => i.sourceKey !== null)).toBe(true);
    expect(system.total).toBe(STARTER_ANAMNESES.length);

    const clinic = await admin.listAnamnesesAcrossClinics(db as unknown as DB, {
      origin: "clinic",
      pageSize: 100,
    });
    expect(clinic.total).toBe(1);

    const beta = await admin.listAnamnesesAcrossClinics(db as unknown as DB, {
      clinicId: clinicB,
    });
    expect(beta.total).toBe(0);
  });

  it("imports starters idempotently (skip existing)", async () => {
    const keys = STARTER_ANAMNESES.map((s) => s.key);

    // Beta is empty → all imported.
    const first = await admin.importStartersToClinic(db as unknown as DB, clinicB, keys);
    expect(first).toEqual({ ok: true, imported: keys, skipped: [] });

    // Re-import → all skipped.
    const second = await admin.importStartersToClinic(db as unknown as DB, clinicB, keys);
    expect(second.ok && second.imported).toEqual([]);
    expect(second.ok && second.skipped.sort()).toEqual([...keys].sort());

    // Alpha already has all → import one, it's skipped.
    const partial = await admin.importStartersToClinic(db as unknown as DB, clinicA, [
      "hipertrofia",
    ]);
    expect(partial).toEqual({ ok: true, imported: [], skipped: ["hipertrofia"] });
  });

  it("rejects an unknown clinic or no valid keys", async () => {
    expect(
      await admin.importStartersToClinic(
        db as unknown as DB,
        "00000000-0000-0000-0000-000000000000",
        ["hipertrofia"],
      ),
    ).toEqual({ ok: false, reason: "clinic_not_found" });
    expect(
      await admin.importStartersToClinic(db as unknown as DB, clinicA, ["nope"]),
    ).toEqual({ ok: false, reason: "no_valid_keys" });
  });

  it("hard-deletes and preserves the student snapshot (source link nulls)", async () => {
    const ok = await admin.hardDeleteAnamnesis(db as unknown as DB, starterAnamnesisId);
    expect(ok).toBe(true);

    // The anamnese is gone…
    const gone = await db
      .select()
      .from(schema.anamnesis)
      .where(eq(schema.anamnesis.id, starterAnamnesisId));
    expect(gone).toHaveLength(0);

    // …but the student's filled snapshot survives, with the source link nulled.
    const [snap] = await db
      .select()
      .from(schema.studentAnamnesis)
      .where(eq(schema.studentAnamnesis.name, "Anamnese — Hipertrofia / Ganho de massa"));
    expect(snap.status).toBe("completed");
    expect(snap.sourceAnamnesisId).toBeNull();

    // Deleting an unknown id is a no-op.
    expect(
      await admin.hardDeleteAnamnesis(
        db as unknown as DB,
        "00000000-0000-0000-0000-000000000000",
      ),
    ).toBe(false);
  });
});
