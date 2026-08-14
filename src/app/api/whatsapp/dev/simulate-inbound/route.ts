import { NextResponse } from "next/server";

import { whatsappSimulateInboundSchema } from "@/lib/whatsapp-inbox";
import { plans, whatsapp } from "@/server/dal";
import { WhatsAppInboundError } from "@/server/dal/whatsapp";
import {
  apiError,
  forbidden,
  notFound,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * DEV-ONLY: simulate an inbound WhatsApp message so the inbox is demoable and
 * testable without a real provider. It runs the SAME `ingestInboundMessage` path
 * a real webhook would — finds/creates the conversation by phone, appends the
 * inbound message, and reopens the 24h window — so one call flips a closed
 * conversation to open and makes free-text sending legal again.
 *
 * Guarded hard: a plain 404 (as if the route didn't exist) unless BOTH
 * `NODE_ENV !== "production"` and `WHATSAPP_ALLOW_SIMULATE === "1"`. When enabled
 * it's still coach-only + plan-gated + tenant-scoped, so it can only ever write
 * into the caller's own clinic. The body is `{ phone, body }` — never a
 * `studentId`: the student is resolved from the phone, exactly like production.
 */
function simulateEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.WHATSAPP_ALLOW_SIMULATE === "1"
  );
}

export const POST = withRoute("whatsapp.dev.simulate", async (request) => {
  if (!simulateEnabled()) return notFound("Não encontrado.");

  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();
  if (!(await plans.canUseWhatsapp(ctx))) return forbidden();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = whatsappSimulateInboundSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const { conversationId } = await whatsapp.ingestInboundMessage(ctx, {
      from: parsed.data.phone,
      body: parsed.data.body,
    });
    logger.info("whatsapp.inbound_simulated", { conversationId });
    return NextResponse.json({ conversationId, windowOpen: true }, { status: 201 });
  } catch (error) {
    if (error instanceof WhatsAppInboundError) {
      return apiError("Número de telefone inválido.", 422);
    }
    throw error;
  }
});
