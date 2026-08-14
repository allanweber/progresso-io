import { sendInviteEmail } from "@/lib/email";
import {
  clinics,
  invitations,
  plans,
  students,
  studentAnamneses,
  whatsapp,
} from "@/server/dal";
import { INVITE_TTL_DAYS } from "@/server/dal/invitations";
import { logger } from "@/server/observability";
import type { TenantContext } from "@/server/tenant";

/**
 * Student onboarding, split into the two moments a student actually needs a link:
 *
 * 1. `sendAnamnesisInvite` — at registration, the (online) student is invited to
 *    **fill their anamnese**. That's the only link they get; no portal account is
 *    created yet (they've done nothing to log into).
 * 2. `sendPortalInvite` — the account-activation link (also e-mailed). It goes out
 *    when the coach has something for the aluno to see — i.e. on the **first diet
 *    or workout published** (`sendPortalInviteOnFirstPrescription`) — or on demand
 *    from the profile's "Enviar convite" button.
 *
 * Both require a WhatsApp number (the online rule guarantees it) and never throw
 * in the unconfigured dev path (the WhatsApp/e-mail stubs capture the links to the
 * test outbox instead).
 */
export type OnboardingResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "no_phone"
        | "already_active"
        | "archived"
        | "no_anamnesis"
        | "whatsapp_disabled";
    };

/**
 * Invites the student to fill their anamnese: issues a fresh public fill token and
 * sends the fill link over WhatsApp. This is the registration message and the
 * "Reenviar anamnese" action. No portal account link is sent here. Requires a
 * still-**pending** anamnese (a completed one has nothing to fill).
 */
export async function sendAnamnesisInvite(
  ctx: TenantContext,
  studentId: string,
  baseUrl: string,
): Promise<OnboardingResult> {
  const student = await students.getStudent(ctx, studentId);
  if (!student) return { ok: false, reason: "already_active" };
  if (student.status === "archived") return { ok: false, reason: "archived" };
  if (!student.phone) return { ok: false, reason: "no_phone" };

  // The anamnese-fill link only goes out over WhatsApp — a channel free clinics
  // don't have. Skip it for them (the student is still registered).
  if (!(await plans.canUseWhatsapp(ctx))) {
    return { ok: false, reason: "whatsapp_disabled" };
  }

  const anamnesis = await studentAnamneses.getStudentAnamnesis(ctx, studentId);
  if (!anamnesis || anamnesis.status !== "pending") {
    return { ok: false, reason: "no_anamnesis" };
  }
  const fillToken = await studentAnamneses.issueFillToken(ctx, studentId);
  if (!fillToken) return { ok: false, reason: "no_anamnesis" };

  // First contact → a friendly WELCOME + request to fill the anamnese (not the
  // "you forgot" reminder). Sent through the template path so it lands in the
  // coach's WhatsApp inbox as a conversation like every other automation. Keeps
  // the "anamnesis_fill" outbox kind the intake e2e reads.
  await whatsapp.sendTemplateToStudent(
    ctx,
    studentId,
    "anamnesis_welcome",
    {
      nome: student.firstName,
      link: `${baseUrl}/anamnesis/fill?token=${fillToken}`,
    },
    "anamnesis_fill",
  );

  logger.info("student.anamnesis_invite_sent", { studentId });
  return { ok: true };
}

/**
 * Sends the student their portal access link (the invite, also e-mailed when they
 * have an e-mail) over WhatsApp so they can activate their aluno login. Guarded to
 * online-capable students who haven't already activated.
 */
export async function sendPortalInvite(
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

  // WhatsApp is a paid-plan channel; the portal link is always e-mailed above,
  // so a free clinic still onboards — it just skips the WhatsApp copy. The send
  // goes through the `welcome_access` template (base or clinic override) so it
  // also lands in the coach's inbox; the outbox keeps the "invite" kind the
  // invite→accept e2e reads.
  if (await plans.canUseWhatsapp(ctx)) {
    await whatsapp.sendTemplateToStudent(
      ctx,
      studentId,
      "welcome_access",
      { nome: student.firstName, link: portalUrl },
      "invite",
    );
  }

  logger.info("student.portal_invite_sent", { studentId });
  return { ok: true };
}

/**
 * Sends the portal invite the first time a coach publishes a diet or workout for a
 * student — the moment there's something worth logging in to see. Best-effort and
 * idempotent: it does nothing for offline students, already-activated students, or
 * students who have already been sent a portal invite (so the second prescription
 * doesn't resend). Never throws — a messaging hiccup must not fail the publish.
 */
export async function sendPortalInviteOnFirstPrescription(
  ctx: TenantContext,
  studentId: string,
  baseUrl: string,
): Promise<void> {
  try {
    const student = await students.getStudent(ctx, studentId);
    if (!student) return;
    if (student.modality !== "online") return;
    if (student.userId) return;
    if (await invitations.hasInvitation(ctx, studentId)) return;

    const result = await sendPortalInvite(ctx, studentId, baseUrl);
    if (!result.ok) {
      logger.info("student.portal_invite_skipped", {
        studentId,
        reason: result.reason,
      });
    }
  } catch (error) {
    // Never let onboarding delivery break the publish response.
    logger.error("student.portal_invite_failed", { err: error, studentId });
  }
}
