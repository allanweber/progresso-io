// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { TenantContext } from "@/server/tenant";
import { anamneses } from "@/server/dal";
import type { AnamnesisWriteInput } from "@/server/dal/anamneses";

import { createTestDb, type TestDb } from "./pglite";

/**
 * The anamnesis (anamnese) DAL. An anamnese is a clinic-owned intake
 * questionnaire — there is NO shared base template. Proves the per-clinic seed
 * of the starter set (idempotent), tenant scoping, and CRUD + copy.
 */

let db: TestDb;
let ctxA: TenantContext;
let ctxB: TenantContext;

function ctxFor(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "coach" };
}

function payload(over?: Partial<AnamnesisWriteInput>): AnamnesisWriteInput {
  return {
    name: "Minha anamnese",
    description: "Descrição",
    objective: "weight_loss",
    modality: "online",
    sections: [
      {
        key: "identificacao",
        title: "Identificação",
        questions: [
          { key: "nome", type: "short_text", label: "Nome completo" },
          { key: "fuma", type: "boolean", label: "Fuma?" },
        ],
      },
    ],
    ...over,
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
});

describe("anamnesis DAL", () => {
  it("seeds a clinic's starter set (>= 5) — and is idempotent", async () => {
    const n = await anamneses.seedClinicAnamneses(
      ctxA.db,
      ctxA.clinicId,
      ctxA.userId,
    );
    expect(n).toBeGreaterThanOrEqual(5);

    // A second call is a no-op (the clinic already has anamneses).
    const again = await anamneses.seedClinicAnamneses(
      ctxA.db,
      ctxA.clinicId,
      ctxA.userId,
    );
    expect(again).toBe(0);

    const list = await anamneses.listAnamneses(ctxA);
    expect(list.total).toBe(n);
    // The seeded rows carry sections + questions.
    expect(list.items.every((i) => i.questionCount > 0)).toBe(true);
    // The online weight-loss starter never asks for skinfolds (dobras).
    const detailList = await Promise.all(
      list.items.map((i) => anamneses.getAnamnesis(ctxA, i.id)),
    );
    const online = detailList.find(
      (a) => a?.objective === "weight_loss" && a?.modality === "online",
    );
    expect(online).toBeTruthy();
    const labels = online!.sections
      .flatMap((s) => s.questions.map((q) => q.label.toLowerCase()))
      .join(" ");
    expect(labels).not.toContain("dobra");
  });

  it("creates, reads, updates and copies — all scoped to the clinic", async () => {
    const created = await anamneses.createAnamnesis(ctxA, payload());
    const detail = await anamneses.getAnamnesis(ctxA, created.id);
    expect(detail).not.toBeNull();
    expect(detail!.name).toBe("Minha anamnese");
    expect(detail!.objective).toBe("weight_loss");
    expect(detail!.sections[0].questions).toHaveLength(2);

    // Another clinic can't see it.
    expect(await anamneses.getAnamnesis(ctxB, created.id)).toBeNull();

    // Update replaces the whole document.
    const upd = await anamneses.updateAnamnesis(ctxA, created.id, {
      ...payload({ name: "Renomeada", modality: "in_person" }),
    });
    expect(upd.ok).toBe(true);
    const after = await anamneses.getAnamnesis(ctxA, created.id);
    expect(after!.name).toBe("Renomeada");
    expect(after!.modality).toBe("in_person");

    // Another clinic can't update it.
    const crossUpd = await anamneses.updateAnamnesis(ctxB, created.id, payload());
    expect(crossUpd).toEqual({ ok: false, reason: "not_found" });

    // Copy makes a "(cópia)".
    const copy = await anamneses.copyAnamnesis(ctxA, created.id);
    expect(copy.ok).toBe(true);
    const copyDetail = await anamneses.getAnamnesis(
      ctxA,
      (copy as { ok: true; id: string }).id,
    );
    expect(copyDetail!.name).toBe("Renomeada (cópia)");
    expect(copyDetail!.sections[0].questions).toHaveLength(2);
  });

  it("backfills an existing clinic that has no anamneses yet", async () => {
    // Clinic B was never seeded (an existing clinic from before the feature).
    const before = await anamneses.listAnamneses(ctxB);
    expect(before.total).toBe(0);

    // The backfill loop calls the same idempotent seeder per clinic.
    const n = await anamneses.seedClinicAnamneses(
      ctxB.db,
      ctxB.clinicId,
      ctxB.userId,
    );
    expect(n).toBeGreaterThanOrEqual(5);
    const after = await anamneses.listAnamneses(ctxB);
    expect(after.total).toBe(n);

    // Re-running the backfill leaves it untouched (idempotent).
    expect(
      await anamneses.seedClinicAnamneses(ctxB.db, ctxB.clinicId, ctxB.userId),
    ).toBe(0);
  });

  it("hard-deletes only the clinic's own anamnese", async () => {
    const created = await anamneses.createAnamnesis(ctxA, payload());

    // Another clinic can't delete it.
    expect(await anamneses.deleteAnamnesis(ctxB, created.id)).toBe(false);
    expect(await anamneses.getAnamnesis(ctxA, created.id)).not.toBeNull();

    // The owner can.
    expect(await anamneses.deleteAnamnesis(ctxA, created.id)).toBe(true);
    expect(await anamneses.getAnamnesis(ctxA, created.id)).toBeNull();
  });
});
