import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { type DB, type Database, schema } from "@/db";
import {
  listSeededAnamnesisKeys,
  seedClinicAnamneses,
} from "@/server/dal/anamneses";
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

/**
 * Which starters to import. An omitted (or `undefined`) domain means **all** of
 * it — that is what skipping the setup guide does, and what the dev seed and the
 * clinic bootstrap have always done. An empty array means "none of this domain",
 * which is a coach who unticked everything, not a missing field.
 */
export type StarterSelection = {
  diets?: readonly string[];
  workouts?: readonly string[];
  anamneses?: readonly string[];
};

export type EnsureStartersResult = {
  /** True when this call stamped the flag (i.e. it was the clinic's first import). */
  seeded: boolean;
  startersSeededAt: Date | null;
  /** The `source_key`s actually inserted by this call, per domain. */
  imported: { diets: string[]; workouts: string[]; anamneses: string[] };
};

/**
 * Imports a clinic's starter anamneses + diets + workouts, in one transaction,
 * and stamps `clinic.starters_seeded_at` the first time it runs.
 *
 * This is the **only** path that puts starters into a clinic: the setup guide
 * calls it with the coach's selection when they finish the Modelos step, and
 * with nothing selected-out when they skip. It used to fire unconditionally from
 * the coach layout on first sign-in, which imported all 30 templates before the
 * coach could be asked which they wanted.
 *
 * Safe to call repeatedly, which is what makes the guide re-runnable:
 *
 * 1. Claim — a transaction-scoped Postgres advisory lock keyed by the clinic id,
 *    so concurrent callers for the same clinic serialize (and different clinics
 *    never contend).
 * 2. Import — every domain inserts only what the clinic is **missing**, matched
 *    on `source_key`, so a re-run adds the newly-ticked templates and leaves the
 *    existing ones (which the coach may have edited) untouched. It is strictly
 *    additive: unticking something here never deletes it.
 * 3. Flag — `starters_seeded_at` is stamped in the SAME transaction, only if it
 *    was still null, so a crash rolls everything back and the next call redoes
 *    it. The flag records that the clinic has been through this once; it no
 *    longer means "has all 30".
 *
 * Returns `seeded: false` with empty imports when the clinic is unknown.
 */
export async function ensureClinicStarters(
  db: DB,
  clinicId: string,
  coachId: string | null,
  selection?: StarterSelection,
): Promise<EnsureStartersResult> {
  const empty = { diets: [], workouts: [], anamneses: [] };

  const [current] = await db
    .select({ at: schema.clinic.startersSeededAt })
    .from(schema.clinic)
    .where(eq(schema.clinic.id, clinicId));
  if (!current) return { seeded: false, startersSeededAt: null, imported: empty };

  const wantedDiets = pickStarters(STARTER_DIETS, selection?.diets);
  const wantedWorkouts = pickStarters(STARTER_WORKOUTS, selection?.workouts);

  const result = await db.transaction(async (tx) => {
    // 1. Claim the clinic — serialize concurrent callers.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`clinic-starters:${clinicId}`})::bigint)`,
    );

    // Re-read the flag inside the lock so two callers can't both stamp it.
    const [row] = await tx
      .select({ at: schema.clinic.startersSeededAt })
      .from(schema.clinic)
      .where(eq(schema.clinic.id, clinicId));
    if (!row) return { seeded: false, at: null as Date | null, imported: empty };

    // 2. Import what's missing, in every domain.
    const resolver = await loadStarterResolver(tx);
    const anamnesisKeys =
      selection?.anamneses === undefined
        ? undefined
        : [...selection.anamneses];
    const anamnesesBefore = await listSeededAnamnesisKeys(tx, clinicId);
    await seedClinicAnamneses(tx, clinicId, coachId, anamnesisKeys);
    const anamnesesAfter = await listSeededAnamnesisKeys(tx, clinicId);
    const seededAnamneses = anamnesesAfter.filter(
      (k) => !anamnesesBefore.includes(k),
    );

    const diets = await insertMissingDiets(
      tx,
      clinicId,
      coachId,
      resolver,
      wantedDiets,
    );
    const workouts = await insertMissingWorkouts(
      tx,
      clinicId,
      coachId,
      resolver,
      wantedWorkouts,
    );

    // 3. Stamp the flag on the first pass only.
    let at = row.at;
    let seeded = false;
    if (!at) {
      at = new Date();
      seeded = true;
      await tx
        .update(schema.clinic)
        .set({ startersSeededAt: at, updatedAt: new Date() })
        .where(eq(schema.clinic.id, clinicId));
    }

    return {
      seeded,
      at,
      imported: {
        diets: diets.imported,
        workouts: workouts.imported,
        anamneses: seededAnamneses,
      },
    };
  });

  return {
    seeded: result.seeded,
    startersSeededAt: result.at,
    imported: result.imported,
  };
}

/** `all` when no keys were given, else the starters whose key was ticked. */
function pickStarters<T extends { key: string }>(
  all: T[],
  keys: readonly string[] | undefined,
): T[] {
  return keys === undefined ? all : all.filter((s) => keys.includes(s.key));
}

/**
 * The starter `source_key`s a clinic already holds, per domain. The setup guide
 * reads this to render an already-imported template as ticked and disabled
 * ("já na sua biblioteca") rather than offering to import it twice.
 */
export async function listClinicStarterKeys(
  db: DB,
  clinicId: string,
): Promise<{ diets: string[]; workouts: string[]; anamneses: string[] }> {
  const [diets, workouts, anamneses] = await Promise.all([
    db
      .select({ sourceKey: schema.diet.sourceKey })
      .from(schema.diet)
      .where(
        and(eq(schema.diet.clinicId, clinicId), isNotNull(schema.diet.sourceKey)),
      ),
    db
      .select({ sourceKey: schema.workout.sourceKey })
      .from(schema.workout)
      .where(
        and(
          eq(schema.workout.clinicId, clinicId),
          isNotNull(schema.workout.sourceKey),
        ),
      ),
    listSeededAnamnesisKeys(db, clinicId),
  ]);
  const keys = (rows: { sourceKey: string | null }[]) =>
    rows.flatMap((r) => (r.sourceKey ? [r.sourceKey] : []));
  return { diets: keys(diets), workouts: keys(workouts), anamneses };
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
