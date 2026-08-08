import { NextResponse } from "next/server";

import { studentDietCreateActionSchema } from "@/lib/student-diets";
import { studentDiets } from "@/server/dal";
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
 * The student's diet state (current published version + in-flight draft +
 * history) and the entry point to start a draft (blank / from a template /
 * editing the active diet). Coach-only; the DAL scopes by `clinicId` +
 * `studentId`, so another clinic's student yields a 404.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withRoute<Params>(
  "student-diet.state",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const state = await studentDiets.getStudentDietState(ctx, id);
    if (!state) return notFound("Aluno não encontrado.");
    return NextResponse.json(state);
  },
);

export const POST = withRoute<Params>(
  "student-diet.create",
  async (request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = studentDietCreateActionSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);
    const action = parsed.data;

    const result =
      action.kind === "blank"
        ? await studentDiets.createBlankDraft(ctx, id, action.name)
        : action.kind === "template"
          ? await studentDiets.createFromTemplate(
              ctx,
              id,
              action.dietId,
              action.name,
            )
          : await studentDiets.editActive(ctx, id);

    if (!result.ok) {
      switch (result.reason) {
        case "has_draft":
          return apiError("Já existe um rascunho em aberto.", 409);
        case "invalid_food":
          return apiError("Um dos alimentos da dieta é inválido.", 422);
        case "no_active":
          return apiError("Não há dieta ativa para editar.", 409);
        default:
          return notFound("Aluno ou dieta não encontrado.");
      }
    }
    logger.info("student-diet.draft.created", {
      studentId: id,
      dietId: result.dietId,
      kind: action.kind,
    });
    return NextResponse.json(
      { dietId: result.dietId, versionId: result.versionId },
      { status: 201 },
    );
  },
);
