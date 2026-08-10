import { NextResponse } from "next/server";

import { db } from "@/db";
import { validateAnswers } from "@/lib/anamneses";
import { normalizePhone } from "@/lib/phone";
import { fillSubmitSchema, type FillPageState } from "@/lib/student-anamneses";
import { z } from "@/lib/validation";
import { notifications, studentAnamneses } from "@/server/dal";
import { recordFailure, tooManyAttempts } from "@/server/anamnesis-fill-attempts";
import { apiError, readJson, validationError } from "@/server/api";
import { logger, withRoute } from "@/server/observability";

/**
 * Public anamnese fill endpoints (no session — the fill token is the credential,
 * and the student confirms their WhatsApp number to unlock the form). Mirrors
 * the invite-accept public flow.
 *
 * GET  ?token=…            → the questionnaire + who it's for (or {valid:false}).
 * POST { token, phone, answers } → submits the answers once the confirmed number
 *   matches the one on file; raises the clinic's `anamnesis_completed`
 *   notification. Number-confirm attempts are rate-limited per token (shared with
 *   the /confirm endpoint that gates the questionnaire).
 */

/** Last 4 digits of a normalized number, to hint the confirm field. */
function phoneHintOf(phone: string | null): string {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : "";
}

export const GET = withRoute("anamneseFill.check", async (request) => {
  const token = new URL(request.url).searchParams.get("token");
  const empty: FillPageState = { valid: false };
  if (!token) return NextResponse.json(empty);

  const found = await studentAnamneses.findByFillToken(db, token);
  if (!found) return NextResponse.json(empty);

  const state: FillPageState = {
    valid: true,
    studentAnamnesisId: found.studentAnamnesis.id,
    studentFirstName: found.student.firstName,
    clinicName: found.clinicName,
    name: found.studentAnamnesis.name,
    sections: found.studentAnamnesis.sections,
    phoneHint: phoneHintOf(found.student.phone),
  };
  return NextResponse.json(state);
});

const submitBodySchema = fillSubmitSchema.extend({
  token: z.string().min(1, "Link inválido."),
});

export const POST = withRoute("anamneseFill.submit", async (request) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = submitBodySchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const { token, phone, answers } = parsed.data;

  const found = await studentAnamneses.findByFillToken(db, token);
  if (!found) {
    return apiError("Link inválido ou expirado. Peça um novo ao seu coach.", 410);
  }

  const key = found.studentAnamnesis.id;
  if (tooManyAttempts(key)) {
    return apiError("Muitas tentativas. Tente novamente mais tarde.", 429);
  }

  // The number the aluno typed must match the one on file (the "login").
  if (normalizePhone(phone) !== found.student.phone) {
    recordFailure(key);
    return apiError("O WhatsApp informado não confere. Verifique o número.", 403);
  }

  // Keep only answers for questions that exist in the snapshot.
  const validKeys = new Set(
    found.studentAnamnesis.sections.flatMap((s) =>
      s.questions.map((q) => q.key),
    ),
  );
  const clean = Object.fromEntries(
    Object.entries(answers).filter(([k]) => validKeys.has(k)),
  );

  // Enforce the questions' masks (date / number / pressure) server-side.
  const invalid = validateAnswers(found.studentAnamnesis.sections, clean);
  if (Object.keys(invalid).length > 0) {
    return NextResponse.json(
      { error: "Verifique os campos informados.", fieldErrors: invalid },
      { status: 422 },
    );
  }

  const result = await studentAnamneses.submitFill(db, found.studentAnamnesis.id, clean);
  if (!result) {
    return apiError("Esta anamnese já foi enviada.", 409);
  }

  // Notify the clinic (every coach's bell) that the aluno filled it.
  await notifications.createNotification(db, {
    clinicId: result.clinicId,
    type: "anamnesis_completed",
    data: {
      studentId: result.studentId,
      studentName: result.studentName,
      anamnesisName: result.anamnesisName,
    },
  });

  logger.info("anamnesis.filled", { studentId: result.studentId });
  return NextResponse.json({ ok: true });
});
