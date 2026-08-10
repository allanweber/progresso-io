import { NextResponse } from "next/server";

import { assignAnamnesisSchema } from "@/lib/student-anamneses";
import { students, studentAnamneses } from "@/server/dal";
import { toStudentAnamnesisDto } from "@/server/dal/student-anamneses";
import {
  apiError,
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
 * Swaps the template on a student's anamnese ("usar outro template"). Snapshots
 * the new template and clears the previous answers/status/token. Coach-only,
 * tenant-scoped.
 */

type Params = { params: Promise<{ id: string }> };

export const PUT = withRoute<Params>(
  "studentAnamnesis.replaceTemplate",
  async (request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();
    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const student = await students.getStudent(ctx, id);
    if (!student) return notFound("Aluno não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = assignAnamnesisSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await studentAnamneses.assignAnamnesis(
      ctx,
      id,
      parsed.data.anamnesisId,
    );
    if (!result.ok) return apiError("Anamnese selecionada não encontrada.", 422);
    logger.info("studentAnamnesis.template_replaced", { studentId: id });
    return NextResponse.json({
      anamnesis: toStudentAnamnesisDto(result.studentAnamnesis),
    });
  },
);
