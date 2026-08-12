import { NextResponse } from "next/server";

import { coachInvitations, coaches } from "@/server/dal";
import { forbidden, isUuid, notFound, unauthorized } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

type Params = { params: Promise<{ inviteId: string }> };

/**
 * Cancels a pending coach invite (owner-only), freeing the seat it reserved.
 * Scoped to the clinic in the DAL, so one clinic can't cancel another's invite.
 */
export const DELETE = withRoute<Params>(
  "coach.team.cancelInvite",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();
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
