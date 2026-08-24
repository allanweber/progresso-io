import { NextResponse } from "next/server";

import { anamnesisFormSchema } from "@/lib/anamneses";
import { anamneses } from "@/server/dal";
import {
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/**
 * A single anamnese: read it, replace it, or delete it. Every operation is
 * scoped to this clinic's own anamneses by the DAL. Coach-only.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withCoach<Params>(
  "anamneses.detail",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Anamnese não encontrada.");

    const anamnesis = await anamneses.getAnamnesis(ctx, id);
    if (!anamnesis) return notFound("Anamnese não encontrada.");
    return NextResponse.json(anamnesis);
  },
);

export const PUT = withCoach<Params>(
  "anamneses.update",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Anamnese não encontrada.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = anamnesisFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await anamneses.updateAnamnesis(ctx, id, parsed.data);
    if (!result.ok) return notFound("Anamnese não encontrada.");
    logger.info("anamnesis.updated", { anamnesisId: id });
    return NextResponse.json({ anamnesis: { id } });
  },
);

export const DELETE = withCoach<Params>(
  "anamneses.delete",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Anamnese não encontrada.");

    const ok = await anamneses.deleteAnamnesis(ctx, id);
    if (!ok) return notFound("Anamnese não encontrada.");
    logger.info("anamnesis.deleted", { anamnesisId: id });
    return NextResponse.json({ anamnesis: { id } });
  },
);
