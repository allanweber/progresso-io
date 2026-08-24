import { NextResponse } from "next/server";

import { dietFormSchema } from "@/lib/diets";
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
 * The in-flight draft of a student's diet: save it (whole tree) or discard it.
 * The payload is the same whole-tree shape as a template diet (`dietFormSchema`);
 * the DAL builds the embedded snapshot from the catalog. Coach-only.
 */
type Params = { params: Promise<{ id: string }> };

export const PUT = withCoach<Params>(
  "student-diet.draft.save",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = dietFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await studentDiets.saveDraft(ctx, id, parsed.data);
    if (!result.ok) {
      if (result.reason === "invalid_food") {
        return apiError("Um dos alimentos da dieta é inválido.", 422);
      }
      return notFound("Nenhum rascunho em aberto.");
    }
    logger.info("student-diet.draft.saved", { studentId: id, dietId: result.dietId });
    return NextResponse.json({ dietId: result.dietId, versionId: result.versionId });
  },
);

export const DELETE = withCoach<Params>(
  "student-diet.draft.discard",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const ok = await studentDiets.discardDraft(ctx, id);
    if (!ok) return notFound("Nenhum rascunho em aberto.");
    logger.info("student-diet.draft.discarded", { studentId: id });
    return NextResponse.json({ ok: true });
  },
);
