import { NextResponse } from "next/server";

import { db } from "@/db";
import { normalizePhone } from "@/lib/phone";
import { z } from "@/lib/validation";
import { studentAnamneses } from "@/server/dal";
import { recordFailure, tooManyAttempts } from "@/server/anamnesis-fill-attempts";
import { apiError, readJson, validationError } from "@/server/api";
import { withRoute } from "@/server/observability";

/**
 * Public confirm step for the anamnese fill flow (no session — the token is the
 * credential). The aluno confirms their WhatsApp number BEFORE the questionnaire
 * is revealed: this checks the number against the one on file and returns
 * `{ ok: true }` when it matches, or 403 when it doesn't. It never mutates
 * anything — the final submit re-verifies the number as defense in depth.
 * Attempts are rate-limited per token, shared with the submit endpoint.
 */

const confirmSchema = z.object({
  token: z.string().min(1, "Link inválido."),
  phone: z.string().trim().min(1, "Confirme seu WhatsApp."),
});

export const POST = withRoute("anamneseFill.confirm", async (request) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = confirmSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const { token, phone } = parsed.data;

  const found = await studentAnamneses.findByFillToken(db, token);
  if (!found) {
    return apiError("Link inválido ou expirado. Peça um novo ao seu coach.", 410);
  }

  const key = found.studentAnamnesis.id;
  if (tooManyAttempts(key)) {
    return apiError("Muitas tentativas. Tente novamente mais tarde.", 429);
  }

  if (normalizePhone(phone) !== found.student.phone) {
    recordFailure(key);
    return apiError("O WhatsApp informado não confere. Verifique o número.", 403);
  }

  return NextResponse.json({ ok: true });
});
