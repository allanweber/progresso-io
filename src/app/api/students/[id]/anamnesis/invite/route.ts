import { NextResponse } from "next/server";

import { apiError, isUuid, notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";
import { sendAnamnesisInvite } from "@/server/onboarding";

/**
 * (Re)sends the WhatsApp anamnese fill link for a student — the same message
 * registration sends. The profile Anamnese card's "Reenviar" action hits this
 * (e.g. the number was wrong at registration, or the link was lost). Only useful
 * while the anamnese is still pending; a completed one has nothing to fill.
 * Coach-only, tenant-scoped.
 */

type Params = { params: Promise<{ id: string }> };

export const POST = withCoach<Params>(
  "anamnesis.invite",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
    const result = await sendAnamnesisInvite(ctx, id, base);
    if (!result.ok) {
      if (result.reason === "no_phone") {
        return apiError("Adicione um WhatsApp ao aluno para enviar a anamnese.", 422);
      }
      if (result.reason === "archived") {
        return apiError("Reative o aluno antes de enviar a anamnese.", 409);
      }
      if (result.reason === "no_anamnesis") {
        return apiError("Esta anamnese não está pendente de preenchimento.", 409);
      }
      return apiError("Não foi possível enviar a anamnese.", 400);
    }

    logger.info("anamnesis.invite_sent", { studentId: id });
    return NextResponse.json({ ok: true });
  },
);
