import { canUseBrandedPortal } from "@/lib/clinic-settings";
import { effectivePlanOf } from "@/lib/plans";
import { clinics } from "@/server/dal";
import { notFound } from "@/server/api";
import { withStudent } from "@/server/guard";
import { readClinicLogo } from "@/server/r2";

/**
 * Streams the logged-in aluno's own clinic logo, for the portal chrome.
 *
 * Separate from the public `/api/public/clinic/<slug>/logo` because that one is
 * addressed by **slug**, and a clinic can be fully branded — logo, accent — while
 * never claiming a portal address. Its students would then be the only people who
 * could not see their coach's mark. Here the clinic comes from the session
 * instead, so no slug is needed and nothing is exposed publicly.
 *
 * Plan-gated exactly like the public route: a free clinic's logo is not served,
 * even to its own aluno, so the portal never shows branding the clinic is not
 * entitled to. 404 when there is no logo, no clinic, or no entitlement — the
 * chrome only points here when the profile says `clinicHasLogo`.
 */
export const GET = withStudent("student-portal.logo", async (_request, ctx) => {
  const clinic = await clinics.getClinic(ctx);
  if (!clinic?.logoKey) return notFound();
  if (!canUseBrandedPortal(effectivePlanOf(clinic, new Date()))) return notFound();

  const file = await readClinicLogo(clinic.logoKey);
  if (!file) return notFound();

  return new Response(new Uint8Array(file.body), {
    status: 200,
    headers: {
      "content-type": file.contentType,
      // Private: this is one tenant's asset served off a session, so a shared
      // cache must never hold it. The public microsite's copy stays public.
      "cache-control": "private, max-age=86400",
    },
  });
});
