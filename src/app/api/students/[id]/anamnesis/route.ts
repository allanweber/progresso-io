import { NextResponse } from "next/server";

import { validateAnswers } from "@/lib/anamneses";
import { editAnswersSchema } from "@/lib/student-anamneses";
import { students, studentAnamneses } from "@/server/dal";
import { toStudentAnamnesisDto } from "@/server/dal/student-anamneses";
import {
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/**
 * A student's anamnese (the filled questionnaire on their profile). Coach-only,
 * tenant-scoped through the DAL.
 *
 * GET → the student's anamnese (or null when none is assigned).
 * PUT → the coach saves/edits the answers in place (filling it for an offline
 *       student, or correcting an already-filled one).
 */

type Params = { params: Promise<{ id: string }> };

export const GET = withCoach<Params>(
  "studentAnamnesis.get",
  async (_request, ctx, { params }) => {
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

export const PUT = withCoach<Params>(
  "studentAnamnesis.saveAnswers",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = editAnswersSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    // Enforce the questions' masks against the student's snapshot.
    const current = await studentAnamneses.getStudentAnamnesis(ctx, id);
    if (!current) return notFound("Este aluno não tem uma anamnese.");
    const invalid = validateAnswers(current.sections, parsed.data.answers);
    if (Object.keys(invalid).length > 0) {
      return NextResponse.json(
        { error: "Verifique os campos informados.", fieldErrors: invalid },
        { status: 422 },
      );
    }

    const row = await studentAnamneses.saveAnswers(ctx, id, parsed.data.answers, "coach");
    if (!row) return notFound("Este aluno não tem uma anamnese.");
    logger.info("studentAnamnesis.answers_saved", { studentId: id });
    return NextResponse.json({ anamnesis: toStudentAnamnesisDto(row) });
  },
);
