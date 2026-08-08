import { NextResponse } from "next/server";

import { studentPortal } from "@/server/dal";
import { forbidden, notFound, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * The aluno's own diet state: the active published version + read-only history.
 * Aluno-only, and the DAL resolves the student from the SESSION (never a
 * client-supplied id) and returns only published versions — a draft is never
 * exposed. A user with no linked student row yields a 404.
 */
export const GET = withRoute("student-portal.diet.state", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "aluno") return forbidden();

  const state = await studentPortal.getMyDietState(ctx);
  if (!state) return notFound("Aluno não encontrado.");
  return NextResponse.json(state);
});
