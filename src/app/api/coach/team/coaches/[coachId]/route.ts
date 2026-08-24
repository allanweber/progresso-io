import { NextResponse } from "next/server";

import { coaches } from "@/server/dal";
import { apiError, forbidden, isAuthId, notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

type Params = { params: Promise<{ coachId: string }> };

/**
 * Removes a coach from the clinic (owner-only). Transfers the coach's alunos to
 * the owner and hard-deletes the account (see {@link coaches.removeCoach}). The
 * owner and the acting user can't be removed.
 */
export const DELETE = withCoach<Params>(
  "coach.team.remove",
  async (_request, ctx, { params }) => {
    if (!(await coaches.isClinicOwner(ctx))) {
      return forbidden("Apenas o responsável pela clínica pode remover coaches.");
    }

    const { coachId } = await params;
    if (!isAuthId(coachId)) return notFound("Coach não encontrado.");

    const result = await coaches.removeCoach(ctx, coachId);
    if (!result.ok) {
      if (result.reason === "not_found") return notFound("Coach não encontrado.");
      if (result.reason === "is_owner") {
        return apiError("O responsável pela clínica não pode ser removido.", 422);
      }
      return apiError("Você não pode remover a si mesmo.", 422);
    }

    logger.info("coach.removed", { clinicId: ctx.clinicId });
    return NextResponse.json({ ok: true });
  },
);
