import { z } from "@/lib/validation";
import {
  assessmentHasValues,
  assessmentSchema,
} from "@/lib/checkin-assessment";
import {
  CHECKIN_POSE_VALUES,
  COACH_CHECKIN_DEFAULT_MODALITY,
  coachCheckinSchema,
} from "@/lib/student-checkins";
import type { CheckinPose, Modality } from "@/db/schema";
import type { AssessmentWriteInput } from "@/server/dal/coach-checkins";
import type { CheckinPhotoInput } from "@/server/dal/student-checkins";
import { apiError, validationError } from "@/server/api";
import { putCheckinPhoto, validateCheckinPhoto } from "@/server/r2";

/**
 * The multipart body of a coach check-in, shared by the CREATE (POST) and EDIT
 * (PATCH) routes.
 *
 * It lives here because the two must not drift: the same date rule, the same
 * weight range, the same assessment JSON field, the same four pose files, the
 * same PT-BR messages. A coach who can log a check-in and then edit it into a
 * state the create path would have rejected is a bug waiting to happen, and two
 * copies of sixty lines of parsing is exactly how that arrives.
 *
 * Every route still owns what only it knows: whether an empty entry is allowed,
 * and what to do with what comes back.
 */

/** Poses whose photo the edit drops. Absent/blank on create. */
const removePosesSchema = z
  .string()
  .transform((v) =>
    v
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p !== ""),
  )
  .pipe(z.array(z.enum(CHECKIN_POSE_VALUES), { error: "Pose inválida." }));

export type CoachCheckinForm = {
  date: string;
  modality: Modality;
  weightKg: number | null;
  note: string | null;
  assessment: AssessmentWriteInput;
  /** Validated pose files, still in memory — store them with {@link storeCheckinPhotos}. */
  photoFiles: { pose: CheckinPose; file: File }[];
  /** Poses to drop (edit only); always empty on create. */
  removePoses: CheckinPose[];
};

export type ParsedCoachCheckinForm =
  | { ok: true; data: CoachCheckinForm }
  | { ok: false; response: Response };

/**
 * Reads and validates the whole multipart body: text fields through
 * {@link coachCheckinSchema}, the optional `assessment` JSON field through
 * {@link assessmentSchema}, and up to four pose images through
 * {@link validateCheckinPhoto}. Returns a ready-made error response on any
 * failure, so a handler stays `if (!form.ok) return form.response;`.
 */
export async function parseCoachCheckinForm(
  request: Request,
): Promise<ParsedCoachCheckinForm> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, response: apiError("Envio inválido.", 400) };
  }

  const parsed = coachCheckinSchema.safeParse({
    date: form.get("date") ?? "",
    modality: form.get("modality") ?? COACH_CHECKIN_DEFAULT_MODALITY,
    weightKg: form.get("weightKg") ?? "",
    note: form.get("note") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, response: validationError(parsed.error) };
  }

  // Optional assessment, carried as a JSON field.
  const rawAssessment = form.get("assessment");
  let assessmentInput: unknown = {};
  if (typeof rawAssessment === "string" && rawAssessment.trim() !== "") {
    try {
      assessmentInput = JSON.parse(rawAssessment);
    } catch {
      return { ok: false, response: apiError("Avaliação inválida.", 400) };
    }
  }
  const parsedAssessment = assessmentSchema.safeParse(assessmentInput);
  if (!parsedAssessment.success) {
    return { ok: false, response: validationError(parsedAssessment.error) };
  }
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
  const photoFiles: { pose: CheckinPose; file: File }[] = [];
  for (const pose of CHECKIN_POSE_VALUES) {
    const file = form.get(pose);
    if (file instanceof File && file.size > 0) {
      const check = validateCheckinPhoto(file);
      if (!check.ok) return { ok: false, response: apiError(check.message, 422) };
      photoFiles.push({ pose, file });
    }
  }

  const parsedRemove = removePosesSchema.safeParse(
    typeof form.get("removePhotos") === "string"
      ? (form.get("removePhotos") as string)
      : "",
  );
  if (!parsedRemove.success) {
    return { ok: false, response: validationError(parsedRemove.error) };
  }

  return {
    ok: true,
    data: {
      date: parsed.data.date,
      modality: parsed.data.modality,
      weightKg: parsed.data.weightKg,
      note: parsed.data.note,
      assessment,
      photoFiles,
      removePoses: parsedRemove.data,
    },
  };
}

/** Uploads the validated pose files, returning what the DAL persists. */
export async function storeCheckinPhotos(
  files: { pose: CheckinPose; file: File }[],
): Promise<CheckinPhotoInput[]> {
  const stored: CheckinPhotoInput[] = [];
  for (const { pose, file } of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    stored.push({ pose, r2Key: await putCheckinPhoto(buffer, file.type) });
  }
  return stored;
}
