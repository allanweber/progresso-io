import { NextResponse } from "next/server";

import { dietFormSchema } from "@/lib/diets";
import { studentDiets } from "@/server/dal";
import {
  apiError,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";
import { sendPortalInviteOnFirstPrescription } from "@/server/onboarding";
import { notifyDietPublished } from "@/server/whatsapp-automations";

/**
 * Publishes the in-flight draft: saves the payload, numbers the version and
 * freezes it (making it available to the aluno). The first publish of a new
 * diet archives the student's previous one. Requires at least one food item.
 * Coach-only. The first diet/workout published also sends the student their
 * portal access link (see onboarding.ts) — the moment there's something to see.
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withCoach<Params>(
  "student-diet.publish",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = dietFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await studentDiets.publishDraft(ctx, id, parsed.data);
    if (!result.ok) {
      switch (result.reason) {
        case "invalid_food":
          return apiError("Um dos alimentos da dieta é inválido.", 422);
        case "empty":
          return apiError(
            "Adicione ao menos um alimento antes de publicar.",
            422,
          );
        default:
          return notFound("Nenhum rascunho em aberto.");
      }
    }
    // The draft matched what is already published: it was closed, no version was
    // numbered, and the aluno has nothing new to be told about.
    if (result.unchanged) {
      logger.info("student-diet.publish-unchanged", {
        studentId: id,
        dietId: result.dietId,
        version: result.version,
      });
      return NextResponse.json({
        dietId: result.dietId,
        version: result.version,
        unchanged: true,
      });
    }

    logger.info("student-diet.published", {
      studentId: id,
      dietId: result.dietId,
      version: result.version,
    });

    // First prescription → grant portal access (best-effort; never fails publish).
    const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
    await sendPortalInviteOnFirstPrescription(ctx, id, base);

    // Nudge the student on WhatsApp that a new diet is up (best-effort + gated).
    await notifyDietPublished(ctx, id);

    return NextResponse.json({
      dietId: result.dietId,
      version: result.version,
      unchanged: false,
    });
  },
);
