import { NextResponse } from "next/server";

import { saveAsTemplateSchema } from "@/lib/student-diets";
import { studentDiets } from "@/server/dal";
import {
  apiError,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/**
 * Exports a student's diet version to the clinic's template catalog (a new
 * reusable `diet`). Defaults to the active diet's latest published version; a
 * `versionId` picks a specific one. Coach-only.
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withCoach<Params>(
  "student-diet.save-as-template",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = saveAsTemplateSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await studentDiets.saveAsTemplate(
      ctx,
      id,
      parsed.data.versionId,
    );
    if (!result.ok) {
      if (result.reason === "invalid_food") {
        return apiError("Um dos alimentos da dieta é inválido.", 422);
      }
      return notFound("Nenhuma versão para salvar como modelo.");
    }
    logger.info("student-diet.saved-as-template", {
      studentId: id,
      dietId: result.id,
    });
    return NextResponse.json({ diet: { id: result.id } }, { status: 201 });
  },
);
