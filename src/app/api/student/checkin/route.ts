import { NextResponse } from "next/server";

import {
  CHECKIN_POSE_VALUES,
  checkinSubmitSchema,
  type CheckinListDto,
} from "@/lib/student-checkins";
import { studentCheckins } from "@/server/dal";
import { apiError, notFound, validationError } from "@/server/api";
import { withStudent } from "@/server/guard";
import { putCheckinPhoto, validateCheckinPhoto } from "@/server/r2";
import type { CheckinPhotoInput } from "@/server/dal/student-checkins";

/**
 * The aluno's check-ins. Aluno-only; the DAL resolves the student from the
 * SESSION (never a client-supplied id) and scopes every query by clinic.
 *
 * - GET  → the timeline (both authors) + weight series for the Evolução tab.
 * - POST → a new check-in: a multipart body carrying `weightKg`, an optional
 *   `note`, and the four required pose photos (already compressed client-side).
 *   Every field is validated with zod; each photo is stored via the R2 helper
 *   (local-disk fallback in dev/e2e), then the check-in is written for today.
 */

export const GET = withStudent(
  "student.checkin.list",
  async (_request, ctx) => {
    const state = await studentCheckins.listMyCheckins(ctx);
    if (!state) return notFound("Aluno não encontrado.");
    return NextResponse.json(state satisfies CheckinListDto);
  },
);

export const POST = withStudent(
  "student.checkin.create",
  async (request, ctx) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError("Envio inválido.", 400);
    }

    // Text fields (weight + optional note).
    const parsed = checkinSubmitSchema.safeParse({
      weightKg: form.get("weightKg"),
      // A missing/absent note is optional — coerce to "" so the string schema
      // maps it to null instead of rejecting a null.
      note: form.get("note") ?? "",
    });
    if (!parsed.success) return validationError(parsed.error);

    // All four poses are required; each must be a valid, small (compressed) image.
    const photos: { pose: (typeof CHECKIN_POSE_VALUES)[number]; file: File }[] = [];
    for (const pose of CHECKIN_POSE_VALUES) {
      const file = form.get(pose);
      if (!(file instanceof File) || file.size === 0) {
        return apiError("Envie as 4 fotos (frente, costas, lado esquerdo e lado direito).", 422);
      }
      const check = validateCheckinPhoto(file);
      if (!check.ok) return apiError(check.message, 422);
      photos.push({ pose, file });
    }

    // Store each photo, then persist the check-in referencing the stored keys.
    const stored: CheckinPhotoInput[] = [];
    for (const { pose, file } of photos) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const r2Key = await putCheckinPhoto(buffer, file.type);
      stored.push({ pose, r2Key });
    }

    const created = await studentCheckins.createStudentCheckin(ctx, {
      weightKg: parsed.data.weightKg,
      note: parsed.data.note,
      photos: stored,
    });
    if (!created) return notFound("Aluno não encontrado.");
    return NextResponse.json(created, { status: 201 });
  },
);
