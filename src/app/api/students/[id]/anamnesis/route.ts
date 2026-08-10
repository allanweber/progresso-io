import { NextResponse } from "next/server";

import { editAnswersSchema } from "@/lib/student-anamneses";
import { students, studentAnamneses } from "@/server/dal";
import { toStudentAnamnesisDto } from "@/server/dal/student-anamneses";
import {
  forbidden,
  isUuid,
  notFound,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * A student's anamnese (the filled questionnaire on their profile). Coach-only,
 * tenant-scoped through the DAL.
 *
 * GET → the student's anamnese (or null when none is assigned).
 * PUT → the coach saves/edits the answers in place (filling it for an offline
 *       student, or correcting an already-filled one).
 */

type Params = { params: Promise<{ id: string }> };

export const GET = withRoute<Params>(
  "studentAnamnesis.get",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();
    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const student = await students.getStudent(ctx, id);
    if (!student) return notFound("Aluno não encontrado.");

    const row = await studentAnamneses.getStudentAnamnesis(ctx, id);
    return NextResponse.json({
      anamnesis: row ? toStudentAnamnesisDto(row) : null,
    });
  },
);

export const PUT = withRoute<Params>(
  "studentAnamnesis.saveAnswers",
  async (request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();
    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = editAnswersSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const row = await studentAnamneses.saveAnswers(ctx, id, parsed.data.answers, "coach");
    if (!row) return notFound("Este aluno não tem uma anamnese.");
    logger.info("studentAnamnesis.answers_saved", { studentId: id });
    return NextResponse.json({ anamnesis: toStudentAnamnesisDto(row) });
  },
);
