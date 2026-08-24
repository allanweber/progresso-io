import { NextResponse } from "next/server";

import { anamneses } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/**
 * Duplicates one of this clinic's anamneses as a new one named "<name> (cópia)".
 * Coach-only; the copy is built server-side from the source, so only the `id`
 * param is validated (no body).
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withCoach<Params>(
  "anamneses.copy",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Anamnese não encontrada.");

    const result = await anamneses.copyAnamnesis(ctx, id);
    if (!result.ok) return notFound("Anamnese não encontrada.");
    logger.info("anamnesis.copied", { sourceAnamnesisId: id, anamnesisId: result.id });
    return NextResponse.json({ anamnesis: { id: result.id } }, { status: 201 });
  },
);
