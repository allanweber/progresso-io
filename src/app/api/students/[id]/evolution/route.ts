import { NextResponse } from "next/server";

import type { EvolutionDto } from "@/lib/student-checkins";
import { coachCheckins } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { withCoach } from "@/server/guard";

/**
 * A student's evolution data for the coach Evolução tab: weight series,
 * assessments (Medidas Δ) and the check-ins with photos (comparison). Coach-only;
 * scoped by `clinicId` + `studentId`.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withCoach<Params>(
  "coach.evolution",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const evo = await coachCheckins.getStudentEvolution(ctx, id);
    if (!evo) return notFound("Aluno não encontrado.");
    return NextResponse.json(evo satisfies EvolutionDto);
  },
);
