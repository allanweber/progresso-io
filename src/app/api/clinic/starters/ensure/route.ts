import { NextResponse } from "next/server";

import { db } from "@/db";
import { starters } from "@/server/dal";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/**
 * Ensures this clinic's starter templates (anamneses + diets + workouts) are
 * seeded — the one-shot background seed the coach's dashboard fires once on first
 * sign-in. Idempotent and concurrency-safe (see `ensureClinicStarters`): a
 * durable `clinic.starters_seeded_at` flag means the actual work runs exactly
 * once per clinic, so this endpoint is safe to POST on every load.
 *
 * Coach-only (an aluno never seeds; a platform admin has no clinic). Takes no
 * body — the tenant is derived from the session, never from client input.
 */
export const POST = withCoach(
  "clinic.starters.ensure",
  async (_request, ctx) => {
    const result = await starters.ensureClinicStarters(db, ctx.clinicId, ctx.userId);
    if (result.seeded) {
      logger.info("clinic.starters_seeded", { clinicId: ctx.clinicId });
    }

    return NextResponse.json({
      seeded: result.seeded,
      startersSeededAt: result.startersSeededAt?.toISOString() ?? null,
    });
  },
);
