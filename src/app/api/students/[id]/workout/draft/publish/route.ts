import { NextResponse } from "next/server";

import { workoutFormSchema } from "@/lib/workouts";
import { studentWorkouts } from "@/server/dal";
import {
  apiError,
  forbidden,
  isUuid,
  notFound,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { sendPortalInviteOnFirstPrescription } from "@/server/onboarding";
import { getTenantContext } from "@/server/tenant";
import { notifyWorkoutPublished } from "@/server/whatsapp-automations";

/**
 * Publishes the in-flight draft: saves the payload, numbers the version and
 * freezes it (making it available to the aluno). The first publish of a new
 * workout archives the student's previous one. Requires at least one exercise.
 * Coach-only. The first diet/workout published also sends the student their
 * portal access link (see onboarding.ts) — the moment there's something to see.
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withRoute<Params>(
  "student-workout.publish",
  async (request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = workoutFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await studentWorkouts.publishDraft(ctx, id, parsed.data);
    if (!result.ok) {
      switch (result.reason) {
        case "invalid_exercise":
          return apiError("Um dos exercícios do treino é inválido.", 422);
        case "empty":
          return apiError(
            "Adicione ao menos um exercício antes de publicar.",
            422,
          );
        default:
          return notFound("Nenhum rascunho em aberto.");
      }
    }
    logger.info("student-workout.published", {
      studentId: id,
      workoutId: result.workoutId,
      version: result.version,
    });

    // First prescription → grant portal access (best-effort; never fails publish).
    const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
    await sendPortalInviteOnFirstPrescription(ctx, id, base);

    // Nudge the student on WhatsApp that a new workout is up (best-effort + gated).
    await notifyWorkoutPublished(ctx, id);

    return NextResponse.json({
      workoutId: result.workoutId,
      version: result.version,
    });
  },
);
