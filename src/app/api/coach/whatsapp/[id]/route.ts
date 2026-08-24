import { NextResponse } from "next/server";

import { whatsappSendSchema } from "@/lib/whatsapp-inbox";
import { plans, whatsapp } from "@/server/dal";
import { WhatsAppSendError } from "@/server/dal/whatsapp";
import {
  apiError,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";
import { whatsappLocked } from "../route";

type Params = { params: Promise<{ id: string }> };

/**
 * A single conversation thread. Opening it marks it read (unread → 0). Coach-
 * only, plan-gated, tenant-scoped (the conversation must belong to this clinic —
 * the DAL enforces it, returning null → 404).
 */
export const GET = withCoach<Params>(
  "coach.whatsapp.thread",
  async (_request, ctx, { params }) => {
    if (!(await plans.canUseWhatsapp(ctx))) return whatsappLocked();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Conversa não encontrada.");

    const thread = await whatsapp.getThread(ctx, id);
    if (!thread) return notFound("Conversa não encontrada.");

    await whatsapp.markRead(ctx, id);
    return NextResponse.json(thread);
  },
);

/**
 * Sends a message on a conversation — free-text (only while the 24h window is
 * open) or an approved template. The DAL enforces the window and template
 * approval; a violation surfaces as a friendly 422 so the UI can explain it.
 */
export const POST = withCoach<Params>(
  "coach.whatsapp.send",
  async (request, ctx, { params }) => {
    if (!(await plans.canUseWhatsapp(ctx))) return whatsappLocked();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Conversa não encontrada.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = whatsappSendSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    try {
      const message = await whatsapp.sendMessage(ctx, id, parsed.data);
      if (!message) return notFound("Conversa não encontrada.");
      logger.info("whatsapp.message_sent", {
        conversationId: id,
        messageId: message.id,
        type: message.type,
      });
      return NextResponse.json({ message }, { status: 201 });
    } catch (error) {
      if (error instanceof WhatsAppSendError) {
        if (error.code === "window_closed") {
          return apiError(
            "A janela de 24h está fechada. Envie um template aprovado.",
            422,
          );
        }
        return apiError("Template inválido ou não aprovado.", 422);
      }
      throw error;
    }
  },
);
