import { NextResponse } from "next/server";

import { diets } from "@/server/dal";
import {
  apiError,
  isUuid,
  notFound,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/**
 * Creates an exact copy of a diet (a base template or the clinic's own) as a new
 * clinic-owned diet named "<name> (cópia)". Coach-only; the DAL scopes the
 * source read by visibility and stamps the copy's `clinicId`/`coachId` from the
 * session. There is no request body — the copy is built server-side from the
 * source, so only the `id` param is validated.
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withCoach<Params>(
  "diets.copy",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Dieta não encontrada.");

    const result = await diets.copyDiet(ctx, id);
    if (!result.ok) {
      if (result.reason === "invalid_food") {
        return apiError("Um dos alimentos da dieta é inválido.", 422);
      }
      return notFound("Dieta não encontrada.");
    }
    logger.info("diet.copied", { sourceDietId: id, dietId: result.id });
    return NextResponse.json({ diet: { id: result.id } }, { status: 201 });
  },
);
