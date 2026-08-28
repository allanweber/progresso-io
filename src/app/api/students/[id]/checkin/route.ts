import { NextResponse } from "next/server";

import { todayYmd } from "@/lib/calendar";
import type { CheckinListDto } from "@/lib/student-checkins";
import { coachCheckins } from "@/server/dal";
import { withCoach } from "@/server/guard";
import { notifyCheckinFeedback } from "@/server/whatsapp-automations";
import type { CreateCoachCheckinInput } from "@/server/dal/coach-checkins";
import {
  parseCoachCheckinForm,
  storeCheckinPhotos,
} from "@/server/checkin-form";
import { apiError, isUuid, notFound } from "@/server/api";

/**
 * A student's check-ins, coach-side. Coach-only; the DAL scopes every query by
 * `clinicId` and confirms the student belongs to this clinic, so another
 * clinic's student yields a 404.
 *
 * - GET  → the timeline (both authors) + weight series (Feedback / Evolução).
 * - POST → an in-person (coach) check-in: a multipart body with a `date`
 *   (today, or a past one when importing history), an optional `weightKg`,
 *   `note`, an `assessment` JSON field (measures/skinfolds) and up to four
 *   optional pose photos — all parsed by the shared `parseCoachCheckinForm`,
 *   which the edit route uses too. A note on a check-in dated today is also sent
 *   to the student on WhatsApp (logged in dev); a backdated one never is.
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

    const form = await parseCoachCheckinForm(request);
    if (!form.ok) return form.response;
    const { date, modality, weightKg, note, assessment, photoFiles } = form.data;

    // A coach entry must carry SOMETHING (a date alone is not a check-in).
    const empty =
      weightKg === null &&
      note === null &&
      photoFiles.length === 0 &&
      assessment === null;
    if (empty) {
      return apiError(
        "Informe ao menos um dado (peso, observação, fotos ou medidas).",
        422,
      );
    }

    const input: CreateCoachCheckinInput = {
      date,
      modality,
      weightKg,
      note,
      photos: await storeCheckinPhotos(photoFiles),
      assessment,
    };
    const created = await coachCheckins.createCoachCheckin(ctx, id, input);
    if (!created) return notFound("Aluno não encontrado.");

    // Notify the student on WhatsApp that their check-in was answered — the
    // `checkin_feedback` template points them to the portal (the note itself
    // lives there). Best-effort + plan-gated inside the helper. A BACKDATED
    // entry never notifies: it is a record of something the student already
    // lived through, and importing a year of history must not fire a year of
    // messages at them.
    if (note && date === todayYmd()) {
      const origin = new URL(request.url).origin;
      await notifyCheckinFeedback(ctx, id, `${origin}/student`);
    }

    return NextResponse.json(created, { status: 201 });
  },
);
