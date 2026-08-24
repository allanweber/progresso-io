import { NextResponse } from "next/server";

import { coachInvitations, coaches } from "@/server/dal";
import { forbidden, isUuid, notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

type Params = { params: Promise<{ inviteId: string }> };

/**
 * Cancels a pending coach invite (owner-only), freeing the seat it reserved.
 * Scoped to the clinic in the DAL, so one clinic can't cancel another's invite.
 */
export const DELETE = withCoach<Params>(
  "coach.team.cancelInvite",
  async (_request, ctx, { params }) => {
    if (!(await coaches.isClinicOwner(ctx))) {
      return forbidden("Apenas o responsável pela clínica pode cancelar convites.");
    }

    const { inviteId } = await params;
    if (!isUuid(inviteId)) return notFound("Convite não encontrado.");

    const removed = await coachInvitations.revokeInvite(ctx, inviteId);
    if (!removed) return notFound("Convite não encontrado.");

    logger.info("coach.invite_canceled", { clinicId: ctx.clinicId });
    return NextResponse.json({ ok: true });
  },
);
