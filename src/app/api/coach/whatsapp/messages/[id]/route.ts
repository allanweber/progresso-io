import { NextResponse } from "next/server";

import { whatsappQueueActionSchema } from "@/lib/whatsapp-inbox";
import { plans, whatsapp } from "@/server/dal";
import {
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { withCoach } from "@/server/guard";
import { whatsappLocked } from "../../route";

type Params = { params: Promise<{ id: string }> };

export const POST = withCoach<Params>(
  "coach.whatsapp.queueAction",
  async (request, ctx, { params }) => {
    if (!(await plans.canUseWhatsapp(ctx))) return whatsappLocked();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Mensagem não encontrada.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = whatsappQueueActionSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const message =
      parsed.data.action === "handoff"
        ? await whatsapp.markHandedOff(ctx, id)
        : await whatsapp.dismissQueued(ctx, id);
    if (!message) return notFound("Mensagem não encontrada.");

    return NextResponse.json({ message });
  },
);
