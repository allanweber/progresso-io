import { NextResponse } from "next/server";

import { apiError, isUuid, notFound, unauthorized } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { sendPortalInvite } from "@/server/onboarding";
import { getTenantContext } from "@/server/tenant";

/**
 * (Re)sends a student their portal access link (also e-mailed) over WhatsApp so
 * they can activate their aluno login. The profile's "Enviar convite" button hits
 * this — an on-demand way to grant portal access (it's otherwise sent
 * automatically on the first diet/workout published). A separate, explicit action
 * — never bundled into an edit. The anamnese fill link is sent separately (see
 * the anamnese "Reenviar" action).
 */

type Params = { params: Promise<{ id: string }> };

export const POST = withRoute<Params>("invite.send", async (request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
  const result = await sendPortalInvite(ctx, id, base);
  if (!result.ok) {
    if (result.reason === "no_phone") {
      return apiError("Adicione um WhatsApp ao aluno para enviar o acesso.", 422);
    }
    if (result.reason === "already_active") {
      return apiError("Este aluno já ativou o acesso.", 409);
    }
    if (result.reason === "archived") {
      return apiError("Reative o aluno antes de convidá-lo.", 409);
    }
    return apiError("Não foi possível enviar o convite.", 400);
  }

  logger.info("invite.sent", { studentId: id });
  return NextResponse.json({ ok: true });
});
