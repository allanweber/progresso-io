import { NextResponse } from "next/server";

import { sendCoachInviteEmail } from "@/lib/email";
import {
  buildTeamDto,
  canInviteCoach,
  type CoachTeamResponse,
  coachInviteSchema,
  planSupportsTeam,
} from "@/lib/coaches";
import { clinics, coachInvitations, coaches, plans } from "@/server/dal";
import { COACH_INVITE_TTL_DAYS } from "@/server/dal/coach-invitations";
import {
  apiError,
  fieldConflict,
  forbidden,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Coach team ("Equipe de coaches"). Read + written by the owner from
 * /coach/settings via TanStack Query. Owner-only surface on team-capable plans
 * (Clínica+): GET returns the roster + pending invites (or `{ enabled: false }`
 * so the card hides), POST sends a coach invite. The tenant comes from the
 * session; every input is zod-validated; a pending invite reserves a seat so the
 * plan's `maxCoaches` cap can't be over-committed.
 */

export const GET = withRoute("coach.team.read", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const [owner, limits] = await Promise.all([
    coaches.isClinicOwner(ctx),
    plans.getPlanLimits(ctx),
  ]);
  if (!owner || !planSupportsTeam(limits.maxCoaches)) {
    return NextResponse.json({ enabled: false } satisfies CoachTeamResponse);
  }

  const [coachRows, pending, clinic] = await Promise.all([
    coaches.listClinicCoaches(ctx),
    coachInvitations.listPendingInvites(ctx),
    clinics.getClinic(ctx),
  ]);
  if (!clinic) return unauthorized();

  const team = buildTeamDto({
    plan: clinic.plan,
    maxCoaches: limits.maxCoaches,
    coaches: coachRows,
    pendingInvites: pending.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
    })),
  });

  return NextResponse.json({ enabled: true, team } satisfies CoachTeamResponse);
});

export const POST = withRoute("coach.team.invite", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();
  if (!(await coaches.isClinicOwner(ctx))) {
    return forbidden("Apenas o responsável pela clínica pode convidar coaches.");
  }

  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = coachInviteSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const { name, email } = parsed.data;

  const limits = await plans.getPlanLimits(ctx);
  if (!planSupportsTeam(limits.maxCoaches)) {
    return apiError("Seu plano não inclui equipe de coaches.", 403);
  }

  // A login for this e-mail already exists — a coach belongs to a single clinic,
  // so we don't move accounts between clinics here.
  if (await coaches.isEmailRegistered(ctx, email)) {
    const m = "Já existe uma conta com este e-mail.";
    return fieldConflict(m, { email: m });
  }

  // Re-inviting the same pending e-mail is a resend (supersede) — it doesn't
  // claim a new seat, so only enforce the cap for a genuinely new invite.
  const alreadyPending = await coachInvitations.hasPendingInvite(ctx, email);
  if (!alreadyPending) {
    const [activeCoaches, pendingCount] = await Promise.all([
      coaches.countActiveCoaches(ctx),
      coachInvitations.countPendingInvites(ctx),
    ]);
    if (!canInviteCoach(activeCoaches + pendingCount, limits.maxCoaches)) {
      return apiError(
        `Seu plano permite até ${limits.maxCoaches} coaches. Remova um coach ou um convite pendente para adicionar outro.`,
        403,
      );
    }
  }

  const { rawToken } = await coachInvitations.createCoachInvitation(ctx, {
    email,
    name,
  });

  const clinic = await clinics.getClinic(ctx);
  const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
  await sendCoachInviteEmail({
    email,
    firstName: name.split(" ")[0] || name,
    clinicName: clinic?.name ?? "sua clínica",
    acceptUrl: `${base}/coach-invite/accept?token=${rawToken}`,
    expiresInDays: COACH_INVITE_TTL_DAYS,
  });

  logger.info("coach.invite_sent", { clinicId: ctx.clinicId });
  return NextResponse.json({ ok: true }, { status: 201 });
});
