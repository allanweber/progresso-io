import { sendInviteEmail } from "@/lib/email";
import { sendStudentOnboardingWhatsApp } from "@/lib/whatsapp";
import { clinics, invitations, students, studentAnamneses } from "@/server/dal";
import { INVITE_TTL_DAYS } from "@/server/dal/invitations";
import { logger } from "@/server/observability";
import type { TenantContext } from "@/server/tenant";

/**
 * Sends an (online) student their onboarding: a portal access link (the invite,
 * also e-mailed for reach) and — when their anamnese is still pending — the
 * anamnese fill link, together in one WhatsApp message. Shared by the merged
 * registration flow and the profile's "Enviar convite" button. The student must
 * have a WhatsApp number (the online rule guarantees it). Returns the generated
 * links (the WhatsApp stub also surfaces them to the coach / test outbox).
 */
export type OnboardingResult =
  | { ok: true; portalUrl: string; anamnesisUrl: string | null }
  | { ok: false; reason: "no_phone" | "already_active" | "archived" };

export async function sendStudentOnboarding(
  ctx: TenantContext,
  studentId: string,
  baseUrl: string,
): Promise<OnboardingResult> {
  const student = await students.getStudent(ctx, studentId);
  if (!student) return { ok: false, reason: "already_active" };
  if (student.status === "archived") return { ok: false, reason: "archived" };
  if (student.userId) return { ok: false, reason: "already_active" };
  if (!student.phone) return { ok: false, reason: "no_phone" };

  const clinic = await clinics.getClinic(ctx);
  const clinicName = clinic?.name ?? "Seu coach";

  // Portal access link (invite) — e-mailed too when the student has an e-mail.
  const { rawToken } = await invitations.createInvitation(ctx, studentId);
  const portalUrl = `${baseUrl}/invite/accept?token=${rawToken}`;
  if (student.email) {
    await sendInviteEmail({
      email: student.email,
      clinicName,
      firstName: student.firstName,
      acceptUrl: portalUrl,
      expiresInDays: INVITE_TTL_DAYS,
    });
  }

  // Anamnese fill link — only when the anamnese is still pending.
  let anamnesisUrl: string | null = null;
  const anamnesis = await studentAnamneses.getStudentAnamnesis(ctx, studentId);
  if (anamnesis && anamnesis.status === "pending") {
    const fillToken = await studentAnamneses.issueFillToken(ctx, studentId);
    if (fillToken) anamnesisUrl = `${baseUrl}/anamnesis/fill?token=${fillToken}`;
  }

  await sendStudentOnboardingWhatsApp({
    to: student.phone,
    clinicName,
    firstName: student.firstName,
    portalUrl,
    anamnesisUrl: anamnesisUrl ?? undefined,
  });

  logger.info("student.onboarding_sent", {
    studentId,
    withAnamnesis: anamnesisUrl !== null,
  });
  return { ok: true, portalUrl, anamnesisUrl };
}
