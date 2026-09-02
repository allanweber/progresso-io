import { NextResponse } from "next/server";

import { canUseBrandedPortal } from "@/lib/clinic-settings";
import { planSupportsTeam } from "@/lib/coaches";
import type { OnboardingStateDto } from "@/lib/onboarding";
import { effectivePlanOf } from "@/lib/plans";
import { clinics, coachInvitations, coaches, plans, starters } from "@/server/dal";
import { notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";
import { STARTER_CATALOG } from "@/server/starters/catalog";

/**
 * State for the setup guide at `/onboarding`, read + stamped by that page via
 * TanStack Query. Coach-only; the tenant comes from the session.
 *
 * GET answers three questions in one round trip — the first request a
 * brand-new coach's browser makes, so it is deliberately one call rather than
 * four: what can be imported, what is already imported, and which of the two
 * Clínica steps this clinic gets. The guide pairs it with the existing
 * `/api/coach/settings` read, whose DTO it also writes back through.
 *
 * POST marks the guide done. It is the same call whether the coach finished or
 * skipped: a coach who said no is not asked again, and Configurações keeps the
 * way back in.
 */

export const GET = withCoach("coach.onboarding.read", async (_request, ctx) => {
  const clinic = await clinics.getClinic(ctx);
  if (!clinic) return notFound("Clínica não encontrada.");

  const [owner, limits, owned] = await Promise.all([
    coaches.isClinicOwner(ctx),
    plans.getPlanLimits(ctx),
    starters.listClinicStarterKeys(ctx.db, ctx.clinicId),
  ]);

  // The Clínica branch is a capability, not a plan string: a Clínica sign-up
  // trials Clínica limits while still stored as `free`, and the whole point of
  // these two steps is to be usable during that evaluation.
  const teamCapable = owner && planSupportsTeam(limits.maxCoaches);

  // Seats left to fill. A pending invite holds one, exactly as the team card
  // counts them, so re-running the guide can't over-commit the plan's cap.
  let seatsAvailable = 0;
  if (teamCapable) {
    const [active, pending] = await Promise.all([
      coaches.countActiveCoaches(ctx),
      coachInvitations.countPendingInvites(ctx),
    ]);
    seatsAvailable =
      limits.maxCoaches === null
        ? 2
        : Math.max(0, limits.maxCoaches - active - pending);
  }

  const portalAllowed =
    teamCapable && canUseBrandedPortal(effectivePlanOf(clinic, new Date()));

  return NextResponse.json({
    completedAt: clinic.onboardingCompletedAt?.toISOString() ?? null,
    startersSeeded: clinic.startersSeededAt !== null,
    catalog: STARTER_CATALOG,
    owned,
    team: { enabled: teamCapable, seatsAvailable },
    portal: { enabled: portalAllowed },
    upsellClinica: !teamCapable,
  } satisfies OnboardingStateDto);
});

export const POST = withCoach("coach.onboarding.complete", async (_request, ctx) => {
  const completedAt = await clinics.completeOnboarding(ctx);
  logger.info("coach.onboarding_completed", { clinicId: ctx.clinicId });
  return NextResponse.json({ completedAt: completedAt.toISOString() });
});
