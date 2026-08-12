import { db } from "@/db";
import { clinics } from "@/server/dal";
import { notFound } from "@/server/api";
import { readClinicLogo } from "@/server/r2";
import { withRoute } from "@/server/observability";

/**
 * Public: streams a clinic's portal logo by slug — the microsite + branded login
 * render `<img src="/api/public/clinic/<slug>/logo">`. No session (it's a public
 * page). Paid-gated at the DAL: an unknown/free/downgraded slug, or a clinic with
 * no logo, is a 404 (the microsite only points here when `hasLogo` is true).
 */
type Params = { params: Promise<{ slug: string }> };

export const GET = withRoute<Params>(
  "public.clinic.logo",
  async (_request, { params }) => {
    const { slug } = await params;
    const key = await clinics.getPublicLogoKeyBySlug(db, slug);
    if (!key) return notFound();

    const file = await readClinicLogo(key);
    if (!file) return notFound();

    return new Response(new Uint8Array(file.body), {
      status: 200,
      headers: {
        "content-type": file.contentType,
        "cache-control": "public, max-age=86400",
      },
    });
  },
);
