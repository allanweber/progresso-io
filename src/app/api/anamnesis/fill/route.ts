import { NextResponse } from "next/server";

import { db } from "@/db";
import { validateAnswers } from "@/lib/anamneses";
import { phonesMatch } from "@/lib/phone";
import { fillSubmitSchema, type FillPageState } from "@/lib/student-anamneses";
import { z } from "@/lib/validation";
import { clinics, notifications, studentAnamneses } from "@/server/dal";
import { sendPortalInviteOnAnamnesisFilled } from "@/server/onboarding";
import { recordFailure, tooManyAttempts } from "@/server/anamnesis-fill-attempts";
import { apiError, readJson, validationError } from "@/server/api";
import { logger, withRoute } from "@/server/observability";

/**
 * Public anamnese fill endpoints (no session — the fill token is the credential,
 * and the student confirms their WhatsApp number to unlock the form). Mirrors
 * the invite-accept public flow.
 *
 * GET  ?token=…            → ONLY whether the link is valid + the clinic/title
 *   (no PII). The student's name, phone hint and the questionnaire are withheld
 *   until the WhatsApp number is confirmed — see /confirm — so a leaked link
 *   can't disclose who it's for.
 * POST { token, phone, answers } → submits the answers once the confirmed number
 *   matches the one on file; raises the clinic's `anamnesis_completed`
 *   notification. Number-confirm attempts are rate-limited per token (shared with
 *   the /confirm endpoint that gates the questionnaire).
 */

export const GET = withRoute("anamneseFill.check", async (request) => {
  const token = new URL(request.url).searchParams.get("token");
  const empty: FillPageState = { valid: false };
  if (!token) return NextResponse.json(empty);

  const found = await studentAnamneses.findByFillToken(db, token);
  if (!found) return NextResponse.json(empty);

  // Minimal, PII-free: only the clinic name + anamnese title (both non-personal)
  // so the confirm gate can render. Identity + questionnaire come after confirm.
  const state: FillPageState = {
    valid: true,
    clinicName: found.clinicName,
    name: found.studentAnamnesis.name,
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
  if (!phonesMatch(phone, found.student.phone)) {
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

  // …and hand the aluno their platform access, which is what they were told to
  // expect: the anamnese is the gate, and clearing it opens the portal. This
  // route is public (the fill token is the credential), so there is no session to
  // derive a tenant from — the context is built from the clinic's owner, exactly
  // as the reminder cron does it. Best-effort and once-only: a delivery hiccup
  // must never turn a successfully submitted questionnaire into an error.
  const owner = await clinics.getClinicOwner(db, result.clinicId);
  if (owner) {
    const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
    await sendPortalInviteOnAnamnesisFilled(
      { db, clinicId: result.clinicId, userId: owner, role: "coach" },
      result.studentId,
      base,
    );
  }

  logger.info("anamnesis.filled", { studentId: result.studentId });
  return NextResponse.json({ ok: true });
});
