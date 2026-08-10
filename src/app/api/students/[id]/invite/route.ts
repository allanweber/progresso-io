import { NextResponse } from "next/server";

import { apiError, isUuid, notFound, unauthorized } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { sendStudentOnboarding } from "@/server/onboarding";
import { getTenantContext } from "@/server/tenant";

/**
 * (Re)sends a student their onboarding — the portal access link (also e-mailed)
 * and, when the anamnese is still pending, the anamnese fill link — over
 * WhatsApp. The profile's "Enviar convite" button hits this (e.g. after flipping
 * an offline student to online). A separate, explicit action — never bundled
 * into an edit.
 */

type Params = { params: Promise<{ id: string }> };

export const POST = withRoute<Params>("invite.send", async (request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
  const result = await sendStudentOnboarding(ctx, id, base);
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

  logger.info("invite.sent", { studentId: id, withAnamnesis: result.anamnesisUrl !== null });
  return NextResponse.json({ ok: true });
});
