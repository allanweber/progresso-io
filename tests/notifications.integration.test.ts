// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { TenantContext } from "@/server/tenant";
import { notifications } from "@/server/dal";

import { createTestDb, type TestDb } from "./pglite";

/**
 * Notifications are clinic-scoped with per-coach read state: two coaches in the
 * same clinic each track their own unread count, and another clinic never sees
 * them.
 */

let db: TestDb;
let clinicA: string;
let clinicB: string;
let ctxCoach1: TenantContext; // clinic A
let ctxCoach2: TenantContext; // clinic A (second coach)
let ctxOther: TenantContext; // clinic B

function ctxFor(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "coach" };
}

async function notify(clinicId: string, name: string) {
  await notifications.createNotification(db as unknown as DB, {
    clinicId,
    type: "anamnesis_completed",
    data: { studentId: "s1", studentName: name, anamnesisName: "Base" },
  });
}

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(schema.user).values([
    { id: "c1", name: "Coach 1", email: "c1@example.com" },
    { id: "c2", name: "Coach 2", email: "c2@example.com" },
    { id: "c3", name: "Coach 3", email: "c3@example.com" },
  ]);
  const [a] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic A", ownerUserId: "c1" })
    .returning();
  const [b] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic B", ownerUserId: "c3" })
    .returning();
  clinicA = a.id;
  clinicB = b.id;
  ctxCoach1 = ctxFor(clinicA, "c1");
  ctxCoach2 = ctxFor(clinicA, "c2");
  ctxOther = ctxFor(clinicB, "c3");
});

describe("notifications DAL", () => {
  it("is clinic-scoped with per-coach read state", async () => {
    await notify(clinicA, "Ana");
    await notify(clinicA, "Bruno");
    await notify(clinicB, "Carla");

    // Both coaches in clinic A see 2 unread; clinic B sees only its own.
    expect((await notifications.listNotifications(ctxCoach1)).unread).toBe(2);
    expect((await notifications.listNotifications(ctxCoach2)).unread).toBe(2);
    const other = await notifications.listNotifications(ctxOther);
    expect(other.items).toHaveLength(1);
    expect(other.unread).toBe(1);

    // Coach 1 marks all read — only Coach 1's count drops.
    await notifications.markAllRead(ctxCoach1);
    expect((await notifications.listNotifications(ctxCoach1)).unread).toBe(0);
    expect((await notifications.listNotifications(ctxCoach2)).unread).toBe(2);

    // The list still returns the items for Coach 1, now flagged read.
    const list1 = await notifications.listNotifications(ctxCoach1);
    expect(list1.items).toHaveLength(2);
    expect(list1.items.every((n) => n.read)).toBe(true);
  });

  it("marks specific notifications read", async () => {
    const list = await notifications.listNotifications(ctxCoach2);
    const first = list.items[0];
    await notifications.markRead(ctxCoach2, [first.id]);
    expect(await notifications.unreadCount(ctxCoach2)).toBe(list.unread - 1);
  });

  it("newest first, carrying the payload", async () => {
    const list = await notifications.listNotifications(ctxOther);
    expect(list.items[0].type).toBe("anamnesis_completed");
    expect((list.items[0].data as { studentName: string }).studentName).toBe(
      "Carla",
    );
  });
});
