import { NextResponse } from "next/server";

import { studentPortal } from "@/server/dal";
import { forbidden, notFound, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * The aluno's identity for the portal chrome (name, coach, clinic, goal).
 * Aluno-only; resolved from the session's own student row. A user with no
 * linked student yields a 404.
 */
export const GET = withRoute("student-portal.profile", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "aluno") return forbidden();

  const profile = await studentPortal.getMyProfile(ctx);
  if (!profile) return notFound("Aluno não encontrado.");
  return NextResponse.json(profile);
});
