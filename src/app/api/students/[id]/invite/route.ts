import { NextResponse } from "next/server";

import { sendInviteEmail } from "@/lib/email";
import { clinics, invitations, students } from "@/server/dal";
import { INVITE_TTL_DAYS } from "@/server/dal/invitations";
import { apiError, isUuid, notFound, unauthorized } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Sends (or re-sends) a student their invite. A separate, explicit action —
 * never bundled into create. Supersedes any outstanding invite for the student
 * and e-mails a fresh set-password link.
 */

type Params = { params: Promise<{ id: string }> };

export const POST = withRoute<Params>("invite.send", async (request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const student = await students.getStudent(ctx, id);
  if (!student) return notFound("Aluno não encontrado.");
  if (student.userId) {
    return apiError("Este aluno já ativou o acesso.", 409);
  }
  if (student.status === "archived") {
    return apiError("Reative o aluno antes de convidá-lo.", 409);
  }

  const clinic = await clinics.getClinic(ctx);
  const { rawToken } = await invitations.createInvitation(ctx, id);

  // Prefer the configured public URL for the link; fall back to the request
  // origin (e.g. local dev without BETTER_AUTH_URL set).
  const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
  const acceptUrl = `${base}/invite/accept?token=${rawToken}`;

  await sendInviteEmail({
    email: student.email,
    clinicName: clinic?.name ?? "Seu coach",
    firstName: student.firstName,
    acceptUrl,
    expiresInDays: INVITE_TTL_DAYS,
  });

  logger.info("invite.sent", { studentId: id, expiresInDays: INVITE_TTL_DAYS });
  return NextResponse.json({ ok: true });
});
