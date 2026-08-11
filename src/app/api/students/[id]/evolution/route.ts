import { NextResponse } from "next/server";

import type { EvolutionDto } from "@/lib/student-checkins";
import { coachCheckins } from "@/server/dal";
import { forbidden, isUuid, notFound, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * A student's evolution data for the coach Evolução tab: weight series,
 * assessments (Medidas Δ) and the check-ins with photos (comparison). Coach-only;
 * scoped by `clinicId` + `studentId`.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withRoute<Params>(
  "coach.evolution",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const evo = await coachCheckins.getStudentEvolution(ctx, id);
    if (!evo) return notFound("Aluno não encontrado.");
    return NextResponse.json(evo satisfies EvolutionDto);
  },
);
