import { NextResponse } from "next/server";

import { starters } from "@/server/dal";
import { logger } from "@/server/observability";
import { readJson, validationError } from "@/server/api";
import { withCoach } from "@/server/guard";
import { STARTER_KEYS } from "@/server/starters/catalog";
import { z } from "@/lib/validation";

/**
 * Imports this clinic's starter templates (anamneses + diets + workouts) — the
 * commit behind the setup guide's "Modelos" step.
 *
 * The body carries the coach's selection: a domain's array lists the
 * `source_key`s they ticked, and an **omitted** domain means all of it (what
 * skipping the guide posts). Unknown keys are dropped rather than rejected — a
 * stale tab holding a key that was retired from the catalog should still import
 * the rest, and no key names anything outside the system starter set anyway.
 *
 * Idempotent and concurrency-safe (see `ensureClinicStarters`): every domain
 * inserts only what the clinic is missing, so a re-run of the guide adds the
 * newly-ticked templates and never touches or duplicates the ones already there.
 *
 * Coach-only (an aluno never seeds; a platform admin has no clinic). The tenant
 * is derived from the session, never from the body.
 */

/** Keys are matched against the catalog, so the shape is all that's validated. */
const keyList = z.array(z.string().trim().min(1).max(64)).max(100);

const selectionSchema = z.object({
  diets: keyList.optional(),
  workouts: keyList.optional(),
  anamneses: keyList.optional(),
});

/** Intersects a posted list with the real catalog; `undefined` stays "all". */
function allow(
  keys: string[] | undefined,
  valid: readonly string[],
): string[] | undefined {
  return keys?.filter((key) => valid.includes(key));
}

export const POST = withCoach("clinic.starters.ensure", async (request, ctx) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = selectionSchema.safeParse(body.data ?? {});
  if (!parsed.success) return validationError(parsed.error);

  const result = await starters.ensureClinicStarters(ctx.db, ctx.clinicId, ctx.userId, {
    diets: allow(parsed.data.diets, STARTER_KEYS.diets),
    workouts: allow(parsed.data.workouts, STARTER_KEYS.workouts),
    anamneses: allow(parsed.data.anamneses, STARTER_KEYS.anamneses),
  });

  const imported =
    result.imported.diets.length +
    result.imported.workouts.length +
    result.imported.anamneses.length;
  if (imported > 0) {
    logger.info("clinic.starters_imported", { clinicId: ctx.clinicId, imported });
  }

  return NextResponse.json({
    seeded: result.seeded,
    startersSeededAt: result.startersSeededAt?.toISOString() ?? null,
    imported: result.imported,
  });
});
