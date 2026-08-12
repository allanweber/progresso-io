import { and, eq, inArray, sql } from "drizzle-orm";

import { type DB, type Database, schema } from "@/db";
import { seedClinicAnamneses } from "@/server/dal/anamneses";
import type { DietMealInput } from "@/server/dal/diets";
import type { WorkoutSessionInput } from "@/server/dal/workouts";
import { STARTER_DIETS, type StarterDiet } from "@/server/diets/starter-templates";
import {
  STARTER_WORKOUTS,
  type StarterWorkout,
} from "@/server/workouts/starter-templates";
import {
  buildDietInput,
  buildWorkoutInput,
  loadStarterResolver,
  type StarterResolver,
} from "@/server/starters/resolve";

/**
 * Starter-template seeding + import. A clinic gets clinic-owned copies of the
 * system starter diets/workouts (referencing base catalog items resolved by
 * slug). Every copy carries `source_key` for provenance and idempotency; the
 * partial unique index `(clinic_id, source_key)` is the last-resort guard against
 * duplicates. Anamneses use the same provenance mechanism (see
 * `seedClinicAnamneses`) and are seeded together here so all three domains land
 * in one background pass on first sign-in (`ensureClinicStarters`).
 */

/** Outcome of a seed/import pass over a set of starters. */
export type StarterInsertResult = { imported: string[]; skipped: string[] };

/* -------------------------------------------------------------------------- */
/*  Tree inserts (mirror the diet/workout DALs, but stamp source_key on the    */
/*  parent and accept a raw DB or a transaction handle so they can run inside   */
/*  the one-shot ensure transaction).                                          */
/* -------------------------------------------------------------------------- */

async function insertDietTree(
  db: Database,
  dietId: string,
  meals: DietMealInput[],
): Promise<void> {
  for (const [mealPos, meal] of meals.entries()) {
    const [m] = await db
      .insert(schema.dietMeal)
      .values({ dietId, name: meal.name, time: meal.time, position: mealPos })
      .returning({ id: schema.dietMeal.id });
    for (const [itemPos, item] of meal.items.entries()) {
      const [it] = await db
        .insert(schema.dietMealItem)
        .values({
          dietMealId: m.id,
          foodId: item.foodId,
          grams: item.grams,
          measureLabel: item.measureLabel ?? null,
          measureGrams: item.measureGrams ?? null,
          position: itemPos,
        })
        .returning({ id: schema.dietMealItem.id });
      if (item.substitutes.length) {
        await db.insert(schema.dietMealItemSubstitute).values(
          item.substitutes.map((sub, i) => ({
            dietMealItemId: it.id,
            foodId: sub.foodId,
            grams: sub.grams,
            measureLabel: sub.measureLabel ?? null,
            measureGrams: sub.measureGrams ?? null,
            position: i,
          })),
        );
      }
    }
  }
}

async function insertWorkoutTree(
  db: Database,
  workoutId: string,
  sessions: WorkoutSessionInput[],
): Promise<void> {
  for (const [sPos, session] of sessions.entries()) {
    const [s] = await db
      .insert(schema.workoutSession)
      .values({ workoutId, name: session.name, position: sPos })
      .returning({ id: schema.workoutSession.id });
    for (const [xPos, ex] of session.exercises.entries()) {
      const [x] = await db
        .insert(schema.workoutExercise)
        .values({
          workoutSessionId: s.id,
          exerciseId: ex.exerciseId,
          sets: ex.sets,
          reps: ex.reps,
          load: ex.load,
          rest: ex.rest,
          note: ex.note,
          technique: ex.technique,
          groupId: ex.groupId,
          position: xPos,
        })
        .returning({ id: schema.workoutExercise.id });
      if (ex.customSubstitutes.length) {
        await db.insert(schema.workoutExerciseSubstitute).values(
          ex.customSubstitutes.map((cs, i) => ({
            workoutExerciseId: x.id,
            substituteExerciseId: cs.exerciseId,
            note: cs.note,
            position: i,
          })),
        );
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Insert-missing helpers (idempotent by source_key)                          */
/* -------------------------------------------------------------------------- */

/**
 * Inserts the given diet starters into a clinic, skipping any it already has
 * (matched by `source_key`) and any whose foods don't resolve against the base
 * catalog. Idempotent — safe to re-run (a partial prior pass fills the gaps).
 */
async function insertMissingDiets(
  db: Database,
  clinicId: string,
  coachId: string | null,
  resolver: StarterResolver,
  starters: StarterDiet[],
): Promise<StarterInsertResult> {
  const keys = starters.map((s) => s.key);
  const existing = keys.length
    ? await db
        .select({ sourceKey: schema.diet.sourceKey })
        .from(schema.diet)
        .where(
          and(
            eq(schema.diet.clinicId, clinicId),
            inArray(schema.diet.sourceKey, keys),
          ),
        )
    : [];
  const have = new Set(existing.map((e) => e.sourceKey));

  const imported: string[] = [];
  const skipped: string[] = [];
  for (const starter of starters) {
    if (have.has(starter.key)) {
      skipped.push(starter.key);
      continue;
    }
    const input = buildDietInput(starter, resolver);
    if (!input) {
      skipped.push(starter.key);
      continue;
    }
    const [row] = await db
      .insert(schema.diet)
      .values({
        clinicId,
        coachId,
        sourceKey: starter.key,
        name: input.name,
        notes: input.notes,
      })
      .returning({ id: schema.diet.id });
    await insertDietTree(db, row.id, input.meals);
    imported.push(starter.key);
  }
  return { imported, skipped };
}

/** Inserts the given workout starters into a clinic (idempotent by `source_key`). */
async function insertMissingWorkouts(
  db: Database,
  clinicId: string,
  coachId: string | null,
  resolver: StarterResolver,
  starters: StarterWorkout[],
): Promise<StarterInsertResult> {
  const keys = starters.map((s) => s.key);
  const existing = keys.length
    ? await db
        .select({ sourceKey: schema.workout.sourceKey })
        .from(schema.workout)
        .where(
          and(
            eq(schema.workout.clinicId, clinicId),
            inArray(schema.workout.sourceKey, keys),
          ),
        )
    : [];
  const have = new Set(existing.map((e) => e.sourceKey));

  const imported: string[] = [];
  const skipped: string[] = [];
  for (const starter of starters) {
    if (have.has(starter.key)) {
      skipped.push(starter.key);
      continue;
    }
    const input = buildWorkoutInput(starter, resolver);
    if (!input) {
      skipped.push(starter.key);
      continue;
    }
    const [row] = await db
      .insert(schema.workout)
      .values({
        clinicId,
        coachId,
        sourceKey: starter.key,
        name: input.name,
        notes: input.notes,
      })
      .returning({ id: schema.workout.id });
    await insertWorkoutTree(db, row.id, input.sessions);
    imported.push(starter.key);
  }
  return { imported, skipped };
}

/* -------------------------------------------------------------------------- */
/*  ensureClinicStarters — the one-shot background seed (first sign-in)         */
/* -------------------------------------------------------------------------- */

export type EnsureStartersResult = {
  /** True when this call performed the seed; false when it was already done. */
  seeded: boolean;
  startersSeededAt: Date | null;
};

/**
 * Seeds a clinic's starter anamneses + diets + workouts exactly once, in one
 * transaction, then stamps `clinic.starters_seeded_at`. Guaranteed to run at most
 * once per clinic:
 *
 * 1. Fast path — reads `starters_seeded_at`; if set, returns immediately (no
 *    lock, no work). This is the steady-state path every sign-in after the first.
 * 2. Claim — takes a transaction-scoped Postgres advisory lock keyed by the
 *    clinic id, so concurrent first-load calls for the same clinic serialize
 *    (and different clinics never contend).
 * 3. Double-check — re-reads the flag inside the lock; a caller that queued
 *    behind the winner sees it set and no-ops.
 * 4. Seed + flag — seeds all three domains and sets the flag in the SAME
 *    transaction, so a crash rolls everything back (flag stays null) and the next
 *    call redoes it; the per-domain inserts are idempotent regardless.
 *
 * Returns `{ seeded: false }` when the clinic is unknown or already seeded.
 */
export async function ensureClinicStarters(
  db: DB,
  clinicId: string,
  coachId: string | null,
): Promise<EnsureStartersResult> {
  // 1. Fast path — no work once seeded.
  const [current] = await db
    .select({ at: schema.clinic.startersSeededAt })
    .from(schema.clinic)
    .where(eq(schema.clinic.id, clinicId));
  if (!current) return { seeded: false, startersSeededAt: null };
  if (current.at) return { seeded: false, startersSeededAt: current.at };

  const result = await db.transaction(async (tx) => {
    // 2. Claim the clinic — serialize concurrent first-load callers.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`clinic-starters:${clinicId}`})::bigint)`,
    );

    // 3. Double-check inside the lock — a queued caller no-ops here.
    const [row] = await tx
      .select({ at: schema.clinic.startersSeededAt })
      .from(schema.clinic)
      .where(eq(schema.clinic.id, clinicId));
    if (!row) return { seeded: false, at: null as Date | null };
    if (row.at) return { seeded: false, at: row.at };

    // 4. Seed all three domains + stamp the flag, atomically.
    const resolver = await loadStarterResolver(tx);
    await seedClinicAnamneses(tx, clinicId, coachId);
    await insertMissingDiets(tx, clinicId, coachId, resolver, STARTER_DIETS);
    await insertMissingWorkouts(tx, clinicId, coachId, resolver, STARTER_WORKOUTS);

    const now = new Date();
    await tx
      .update(schema.clinic)
      .set({ startersSeededAt: now, updatedAt: new Date() })
      .where(eq(schema.clinic.id, clinicId));
    return { seeded: true, at: now };
  });

  return { seeded: result.seeded, startersSeededAt: result.at };
}

/* -------------------------------------------------------------------------- */
/*  Admin import (selected starters → chosen clinic, on demand)                 */
/* -------------------------------------------------------------------------- */

export type ImportStartersResult =
  | { ok: true; imported: string[]; skipped: string[] }
  | { ok: false; reason: "clinic_not_found" | "no_valid_keys" };

/** Imports selected diet starters into a clinic (idempotent by `source_key`). */
export async function importDietStartersToClinic(
  db: DB,
  clinicId: string,
  keys: string[],
): Promise<ImportStartersResult> {
  const [clinicRow] = await db
    .select({ ownerUserId: schema.clinic.ownerUserId })
    .from(schema.clinic)
    .where(eq(schema.clinic.id, clinicId));
  if (!clinicRow) return { ok: false, reason: "clinic_not_found" };

  const wanted = STARTER_DIETS.filter((s) => keys.includes(s.key));
  if (wanted.length === 0) return { ok: false, reason: "no_valid_keys" };

  return db.transaction(async (tx) => {
    const resolver = await loadStarterResolver(tx);
    const { imported, skipped } = await insertMissingDiets(
      tx,
      clinicId,
      clinicRow.ownerUserId,
      resolver,
      wanted,
    );
    return { ok: true, imported, skipped };
  });
}

/** Imports selected workout starters into a clinic (idempotent by `source_key`). */
export async function importWorkoutStartersToClinic(
  db: DB,
  clinicId: string,
  keys: string[],
): Promise<ImportStartersResult> {
  const [clinicRow] = await db
    .select({ ownerUserId: schema.clinic.ownerUserId })
    .from(schema.clinic)
    .where(eq(schema.clinic.id, clinicId));
  if (!clinicRow) return { ok: false, reason: "clinic_not_found" };

  const wanted = STARTER_WORKOUTS.filter((s) => keys.includes(s.key));
  if (wanted.length === 0) return { ok: false, reason: "no_valid_keys" };

  return db.transaction(async (tx) => {
    const resolver = await loadStarterResolver(tx);
    const { imported, skipped } = await insertMissingWorkouts(
      tx,
      clinicId,
      clinicRow.ownerUserId,
      resolver,
      wanted,
    );
    return { ok: true, imported, skipped };
  });
}
