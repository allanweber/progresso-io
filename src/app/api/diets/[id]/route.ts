import { NextResponse } from "next/server";

import { dietFormSchema } from "@/lib/diets";
import { diets } from "@/server/dal";
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
 * A single diet: read its full tree, replace it, archive or unarchive it.
 * Reads see base templates + this clinic's own; every write only ever touches
 * the clinic's own diets (the DAL scopes by `clinicId`, so a base/other-clinic
 * id yields a 404). Coach-only.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withCoach<Params>(
  "diets.detail",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Dieta não encontrada.");

    const diet = await diets.getDiet(ctx, id);
    if (!diet) return notFound("Dieta não encontrada.");
    return NextResponse.json(diet);
  },
);

export const PUT = withCoach<Params>(
  "diets.update",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Dieta não encontrada.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = dietFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await diets.updateDiet(ctx, id, parsed.data);
    if (!result.ok) {
      if (result.reason === "invalid_food") {
        return apiError("Um dos alimentos selecionados é inválido.", 422);
      }
      return notFound("Dieta não encontrada ou não editável.");
    }
    logger.info("diet.updated", { dietId: id });
    return NextResponse.json({ diet: { id } });
  },
);

export const DELETE = withCoach<Params>(
  "diets.archive",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Dieta não encontrada.");

    const ok = await diets.archiveDiet(ctx, id);
    if (!ok) return notFound("Dieta não encontrada ou não editável.");
    logger.info("diet.archived", { dietId: id });
    return NextResponse.json({ diet: { id } });
  },
);

export const PATCH = withCoach<Params>(
  "diets.unarchive",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Dieta não encontrada.");

    const ok = await diets.unarchiveDiet(ctx, id);
    if (!ok) return notFound("Dieta não encontrada ou não editável.");
    logger.info("diet.unarchived", { dietId: id });
    return NextResponse.json({ diet: { id } });
  },
);
