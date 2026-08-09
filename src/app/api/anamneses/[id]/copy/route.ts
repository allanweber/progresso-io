import { NextResponse } from "next/server";

import { anamneses } from "@/server/dal";
import { forbidden, isUuid, notFound, unauthorized } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Duplicates one of this clinic's anamneses as a new one named "<name> (cópia)".
 * Coach-only; the copy is built server-side from the source, so only the `id`
 * param is validated (no body).
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withRoute<Params>(
  "anamneses.copy",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Anamnese não encontrada.");

    const result = await anamneses.copyAnamnesis(ctx, id);
    if (!result.ok) return notFound("Anamnese não encontrada.");
    logger.info("anamnesis.copied", { sourceAnamnesisId: id, anamnesisId: result.id });
    return NextResponse.json({ anamnesis: { id: result.id } }, { status: 201 });
  },
);
