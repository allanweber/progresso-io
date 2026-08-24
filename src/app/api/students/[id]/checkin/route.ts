import { NextResponse } from "next/server";

import {
  assessmentHasValues,
  assessmentSchema,
} from "@/lib/checkin-assessment";
import {
  CHECKIN_POSE_VALUES,
  coachCheckinSchema,
  type CheckinListDto,
} from "@/lib/student-checkins";
import { coachCheckins } from "@/server/dal";
import { withCoach } from "@/server/guard";
import { notifyCheckinFeedback } from "@/server/whatsapp-automations";
import type {
  AssessmentWriteInput,
  CreateCoachCheckinInput,
} from "@/server/dal/coach-checkins";
import type { CheckinPhotoInput } from "@/server/dal/student-checkins";
import {
  apiError,
  isUuid,
  notFound,
  validationError,
} from "@/server/api";
import { putCheckinPhoto, validateCheckinPhoto } from "@/server/r2";

/**
 * A student's check-ins, coach-side. Coach-only; the DAL scopes every query by
 * `clinicId` and confirms the student belongs to this clinic, so another
 * clinic's student yields a 404.
 *
 * - GET  → the timeline (both authors) + weight series (Feedback / Evolução).
 * - POST → an in-person (coach) check-in: a multipart body with an optional
 *   `weightKg`, `note`, an `assessment` JSON field (measures/skinfolds) and up
 *   to four optional pose photos. The coach's note is also sent to the student
 *   on WhatsApp (logged in dev).
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withCoach<Params>(
  "coach.checkin.list",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const state = await coachCheckins.listStudentCheckins(ctx, id);
    if (!state) return notFound("Aluno não encontrado.");
    return NextResponse.json(state satisfies CheckinListDto);
  },
);

export const POST = withCoach<Params>(
  "coach.checkin.create",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError("Envio inválido.", 400);
    }

    // Text fields: weight + note are both optional for a coach entry.
    const parsed = coachCheckinSchema.safeParse({
      weightKg: form.get("weightKg") ?? "",
      note: form.get("note") ?? "",
    });
    if (!parsed.success) return validationError(parsed.error);

    // Optional assessment, carried as a JSON field.
    const rawAssessment = form.get("assessment");
    let assessmentInput: unknown = {};
    if (typeof rawAssessment === "string" && rawAssessment.trim() !== "") {
      try {
        assessmentInput = JSON.parse(rawAssessment);
      } catch {
        return apiError("Avaliação inválida.", 400);
      }
    }
    const parsedAssessment = assessmentSchema.safeParse(assessmentInput);
    if (!parsedAssessment.success) return validationError(parsedAssessment.error);
    const assessment: AssessmentWriteInput = assessmentHasValues(
      parsedAssessment.data,
    )
      ? {
          circumferences: parsedAssessment.data.circumferences,
          skinfolds: parsedAssessment.data.skinfolds,
          bodyFatPct: parsedAssessment.data.bodyFatPct,
        }
      : null;

    // Optional photos (0–4); each must be a valid, small (compressed) image.
    const photoFiles: { pose: (typeof CHECKIN_POSE_VALUES)[number]; file: File }[] =
      [];
    for (const pose of CHECKIN_POSE_VALUES) {
      const file = form.get(pose);
      if (file instanceof File && file.size > 0) {
        const check = validateCheckinPhoto(file);
        if (!check.ok) return apiError(check.message, 422);
        photoFiles.push({ pose, file });
      }
    }

    // A coach entry must carry SOMETHING.
    const empty =
      parsed.data.weightKg === null &&
      parsed.data.note === null &&
      photoFiles.length === 0 &&
      assessment === null;
    if (empty) {
      return apiError(
        "Informe ao menos um dado (peso, observação, fotos ou medidas).",
        422,
      );
    }

    const stored: CheckinPhotoInput[] = [];
    for (const { pose, file } of photoFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const r2Key = await putCheckinPhoto(buffer, file.type);
      stored.push({ pose, r2Key });
    }

    const input: CreateCoachCheckinInput = {
      weightKg: parsed.data.weightKg,
      note: parsed.data.note,
      photos: stored,
      assessment,
    };
    const created = await coachCheckins.createCoachCheckin(ctx, id, input);
    if (!created) return notFound("Aluno não encontrado.");

    // Notify the student on WhatsApp that their check-in was answered — the
    // `checkin_feedback` template points them to the portal (the note itself
    // lives there). Best-effort + plan-gated inside the helper.
    if (parsed.data.note) {
      const origin = new URL(request.url).origin;
      await notifyCheckinFeedback(ctx, id, `${origin}/student`);
    }

    return NextResponse.json(created, { status: 201 });
  },
);
