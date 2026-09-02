import { sendAnamnesisEmail, sendInviteEmail } from "@/lib/email";
import { portalPathPrefix } from "@/lib/clinic-settings";
import { effectivePlanOf } from "@/lib/plans";
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
 * Student onboarding: what an **online** aluno is sent, and when.
 *
 * Registering an online student always starts a conversation — there is no path
 * where they are created and hear nothing:
 *
 * - **With an anamnese** → `sendAnamnesisInvite` sends the questionnaire first.
 *   Completing it (the aluno submits on the public fill page) is what triggers
 *   `sendPortalInviteOnce`, because that is the moment there is something to
 *   build a program from.
 * - **Without an anamnese** → `sendPortalInvite` goes out at registration. With
 *   no questionnaire to wait for, holding the access link back would leave the
 *   student registered and silent — which is exactly the bug this replaced.
 *
 * `sendPortalInviteOnFirstPrescription` stays as the backstop for students who
 * reach a published diet/workout without either trigger having fired.
 *
 * **Every one of these goes out on BOTH channels — e-mail and WhatsApp.** The
 * online rule guarantees a student has both, WhatsApp is where they actually
 * read, and e-mail is the copy that survives and that a free clinic still has
 * (WhatsApp is a paid channel). The anamnese link used to be WhatsApp-only,
 * which meant a free clinic's new aluno was never contacted.
 *
 * Nothing here throws in the unconfigured dev path — the WhatsApp/e-mail stubs
 * capture the links to the test outbox instead.
 *
 * **Every link goes under the clinic's Portal do aluno when it has one** — see
 * {@link studentLinkBase}. First contact is exactly when a student should see
 * their coach's brand, not ours.
 */
export type OnboardingResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "no_phone"
        | "already_active"
        | "archived"
        | "no_anamnesis";
    };

/**
 * The base every student-facing link is built from: the clinic's portal address
 * when it publishes one, the bare origin otherwise.
 *
 * Resolved per send rather than stored, so a clinic that claims a slug today has
 * branded links tomorrow without a migration — and one whose portal went dark
 * (trial over, downgrade) silently falls back to the canonical routes instead of
 * mailing links to a 404.
 *
 * Exported for the integration test: both senders below reach WhatsApp/e-mail
 * stubs whose output a test can only see if templates happen to be seeded, so
 * the branded-vs-canonical decision is asserted here, where it is actually made.
 */
export async function studentLinkBase(
  ctx: TenantContext,
  baseUrl: string,
): Promise<string> {
  const clinic = await clinics.getClinic(ctx);
  if (!clinic) return baseUrl;
  return (
    baseUrl +
    portalPathPrefix({
      portalSubdomain: clinic.portalSubdomain,
      effectivePlan: effectivePlanOf(clinic, new Date()),
    })
  );
}

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

  const anamnesis = await studentAnamneses.getStudentAnamnesis(ctx, studentId);
  if (!anamnesis || anamnesis.status !== "pending") {
    return { ok: false, reason: "no_anamnesis" };
  }
  const fillToken = await studentAnamneses.issueFillToken(ctx, studentId);
  if (!fillToken) return { ok: false, reason: "no_anamnesis" };

  const clinic = await clinics.getClinic(ctx);
  const fillUrl = `${await studentLinkBase(ctx, baseUrl)}/anamnesis/fill?token=${fillToken}`;

  // E-mail always. It used to be WhatsApp-only, gated on a paid plan, so a free
  // clinic's newly registered aluno received nothing at all and the coach had no
  // way to tell.
  if (student.email) {
    await sendAnamnesisEmail({
      email: student.email,
      clinicName: clinic?.name ?? "Seu coach",
      firstName: student.firstName,
      fillUrl,
    });
  }

  // And WhatsApp wherever the plan has it. First contact → a friendly WELCOME +
  // request to fill the anamnese (not the "you forgot" reminder). Sent through
  // the template path so it lands in the coach's WhatsApp inbox as a
  // conversation like every other automation. Keeps the "anamnesis_fill" outbox
  // kind the intake e2e reads.
  if (await plans.canUseWhatsapp(ctx)) {
    await whatsapp.sendTemplateToStudent(
      ctx,
      studentId,
      "anamnesis_welcome",
      { nome: student.firstName, link: fillUrl },
      "anamnesis_fill",
    );
  }

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
  const base = clinic
    ? baseUrl +
      portalPathPrefix({
        portalSubdomain: clinic.portalSubdomain,
        effectivePlan: effectivePlanOf(clinic, new Date()),
      })
    : baseUrl;
  const portalUrl = `${base}/invite/accept?token=${rawToken}`;
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
 * Sends the portal invite **at most once** per student, best-effort.
 *
 * The shared body behind every automatic trigger — the anamnese being completed,
 * a first diet/workout being published — because they race by nature: an aluno
 * can submit their questionnaire while the coach is publishing their first plan,
 * and neither path should mint a second invitation or blow up the response it is
 * riding on. Does nothing for offline students, already-activated students, or a
 * student who already has an invite; never throws.
 */
export async function sendPortalInviteOnce(
  ctx: TenantContext,
  studentId: string,
  baseUrl: string,
  trigger: string,
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
        trigger,
        reason: result.reason,
      });
    }
  } catch (error) {
    // Never let onboarding delivery break the response it is riding on.
    logger.error("student.portal_invite_failed", { err: error, studentId, trigger });
  }
}

/**
 * Sends the portal invite when an online aluno submits their anamnese — the
 * moment the coach asked them to wait for. This is the second half of the
 * "anamnese first, then access" flow: the questionnaire is the gate, and
 * clearing it opens the platform.
 *
 * Called from the PUBLIC fill route, which has no session, so the caller builds a
 * clinic-owner context the way the reminder cron does.
 */
export async function sendPortalInviteOnAnamnesisFilled(
  ctx: TenantContext,
  studentId: string,
  baseUrl: string,
): Promise<void> {
  await sendPortalInviteOnce(ctx, studentId, baseUrl, "anamnesis_filled");
}

/**
 * Sends the portal invite the first time a coach publishes a diet or workout for
 * a student. A backstop rather than the main path now: a student with an anamnese
 * is invited when they fill it, and one without is invited at registration — this
 * catches whoever reached a published program without either having fired.
 */
export async function sendPortalInviteOnFirstPrescription(
  ctx: TenantContext,
  studentId: string,
  baseUrl: string,
): Promise<void> {
  await sendPortalInviteOnce(ctx, studentId, baseUrl, "first_prescription");
}
