import "server-only";

import { render } from "@react-email/render";
import { Resend } from "resend";

import {
  ADMIN_INVITE_EMAIL_SUBJECT,
  AdminInviteEmail,
} from "@/components/emails/admin-invite-email";
import {
  COACH_INVITE_EMAIL_SUBJECT,
  CoachInviteEmail,
} from "@/components/emails/coach-invite-email";
import {
  INVITE_EMAIL_SUBJECT,
  InviteEmail,
} from "@/components/emails/invite-email";
import {
  OTP_EMAIL_COPY,
  OtpEmail,
  type OtpEmailType,
} from "@/components/emails/otp-email";
import { captureOutbox } from "@/lib/test-outbox";
import { logger } from "@/server/observability";

export type { OtpEmailType };

type SendOtpArgs = {
  email: string;
  otp: string;
  type: OtpEmailType;
};

const FROM = process.env.EMAIL_FROM ?? "Progresso IO <no-reply@progresso.io>";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/** Renders the OTP e-mail to HTML + plain text. Exported for testing. */
export async function renderOtpEmail(
  otp: string,
  type: OtpEmailType,
): Promise<{ subject: string; html: string; text: string }> {
  const element = <OtpEmail otp={otp} type={type} />;
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { subject: OTP_EMAIL_COPY[type].subject, html, text };
}

/**
 * Sends an OTP e-mail through Resend. When `RESEND_API_KEY` is not configured
 * (local dev / tests) the code is logged to the server console instead so the
 * flow stays usable without a real e-mail provider.
 */
export async function sendOtpEmail({ email, otp, type }: SendOtpArgs): Promise<void> {
  // Captured for e2e (env-gated, never in production): the sign-up flow the
  // setup-guide spec drives ends at an OTP that exists nowhere else readable.
  captureOutbox({
    to: email,
    subject: `Código de ${type}`,
    kind: "otp",
    code: otp,
  });

  if (!resend) {
    console.info(`[email:dev] OTP for ${email} (${type}): ${otp}`);
    return;
  }

  const { subject, html, text } = await renderOtpEmail(otp, type);
  try {
    await resend.emails.send({ from: FROM, to: email, subject, html, text });
    logger.info("email.sent", { template: "otp", type });
  } catch (error) {
    logger.error("email.send_failed", { err: error, template: "otp", type });
    throw error;
  }
}

export type SendOtp = typeof sendOtpEmail;

type SendInviteArgs = {
  email: string;
  clinicName: string;
  firstName: string;
  acceptUrl: string;
  expiresInDays: number;
};

/**
 * Sends a student their invite e-mail (a link to set a password and activate
 * their aluno login). Falls back to a console log when Resend isn't configured
 * (local dev). Always records the accept URL in the test outbox when enabled,
 * so e2e can drive the accept flow without a real inbox.
 */
export async function sendInviteEmail({
  email,
  clinicName,
  firstName,
  acceptUrl,
  expiresInDays,
}: SendInviteArgs): Promise<void> {
  captureOutbox({
    to: email,
    subject: INVITE_EMAIL_SUBJECT,
    kind: "invite",
    url: acceptUrl,
  });

  if (!resend) {
    console.info(`[email:dev] invite for ${email}: ${acceptUrl}`);
    return;
  }

  const element = (
    <InviteEmail
      clinicName={clinicName}
      firstName={firstName}
      acceptUrl={acceptUrl}
      expiresInDays={expiresInDays}
    />
  );
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: INVITE_EMAIL_SUBJECT,
      html,
      text,
    });
    logger.info("email.sent", { template: "invite" });
  } catch (error) {
    logger.error("email.send_failed", { err: error, template: "invite" });
    throw error;
  }
}

export type SendInvite = typeof sendInviteEmail;

type SendAdminInviteArgs = {
  email: string;
  firstName: string;
  acceptUrl: string;
  expiresInDays: number;
};

/**
 * Sends a new platform admin their invite e-mail (a link to set a password and
 * activate their admin login). Falls back to a console log when Resend isn't
 * configured (local dev), and always records the accept URL in the test outbox
 * so e2e can drive the accept flow without a real inbox.
 */
export async function sendAdminInviteEmail({
  email,
  firstName,
  acceptUrl,
  expiresInDays,
}: SendAdminInviteArgs): Promise<void> {
  captureOutbox({
    to: email,
    subject: ADMIN_INVITE_EMAIL_SUBJECT,
    kind: "admin_invite",
    url: acceptUrl,
  });

  if (!resend) {
    console.info(`[email:dev] admin invite for ${email}: ${acceptUrl}`);
    return;
  }

  const element = (
    <AdminInviteEmail
      firstName={firstName}
      acceptUrl={acceptUrl}
      expiresInDays={expiresInDays}
    />
  );
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: ADMIN_INVITE_EMAIL_SUBJECT,
      html,
      text,
    });
    logger.info("email.sent", { template: "admin_invite" });
  } catch (error) {
    logger.error("email.send_failed", { err: error, template: "admin_invite" });
    throw error;
  }
}

type SendCoachInviteArgs = {
  email: string;
  firstName: string;
  clinicName: string;
  acceptUrl: string;
  expiresInDays: number;
};

/**
 * Sends a new coach their invite e-mail (a link to set a password and activate
 * their coach login inside the inviting clinic). Falls back to a console log
 * when Resend isn't configured (local dev), and always records the accept URL in
 * the test outbox so e2e can drive the accept flow without a real inbox.
 */
export async function sendCoachInviteEmail({
  email,
  firstName,
  clinicName,
  acceptUrl,
  expiresInDays,
}: SendCoachInviteArgs): Promise<void> {
  captureOutbox({
    to: email,
    subject: COACH_INVITE_EMAIL_SUBJECT,
    kind: "coach_invite",
    url: acceptUrl,
  });

  if (!resend) {
    console.info(`[email:dev] coach invite for ${email}: ${acceptUrl}`);
    return;
  }

  const element = (
    <CoachInviteEmail
      firstName={firstName}
      clinicName={clinicName}
      acceptUrl={acceptUrl}
      expiresInDays={expiresInDays}
    />
  );
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: COACH_INVITE_EMAIL_SUBJECT,
      html,
      text,
    });
    logger.info("email.sent", { template: "coach_invite" });
  } catch (error) {
    logger.error("email.send_failed", { err: error, template: "coach_invite" });
    throw error;
  }
}

/** Where contact-form messages are delivered. Kept server-side (not exposed). */
const CONTACT_TO = process.env.CONTACT_EMAIL;

/**
 * Sends a contact-form message to the internal contact address. The recipient
 * is never exposed to the client; the sender's e-mail is set as reply-to so
 * replies go straight back to them. Logs to the console when Resend or the
 * contact address isn't configured (local dev).
 */
export async function sendContactEmail({
  name,
  email,
  message,
}: {
  name: string;
  email: string;
  message: string;
}): Promise<void> {
  const subject = `Contato via site — ${name}`;
  const text = `Nome: ${name}\nE-mail: ${email}\n\nMensagem:\n${message}`;

  if (!resend || !CONTACT_TO) {
    console.info(`[email:dev] contact from ${name} <${email}>: ${message}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM,
      to: CONTACT_TO,
      replyTo: email,
      subject,
      text,
    });
    logger.info("email.sent", { template: "contact" });
  } catch (error) {
    logger.error("email.send_failed", { err: error, template: "contact" });
    throw error;
  }
}

/**
 * Tells the internal contact address that a coach asked to subscribe, so the
 * fatura can be reconciled and marked paid. There is no gateway webhook yet
 * (roadmap item 0 Phase 2), so this e-mail *is* the notification that money is
 * on its way. Reply-to is the coach, so answering reaches them directly.
 *
 * Never throws: the coach's subscription request must not fail because e-mail
 * is down or unconfigured — the fatura is already persisted, which is the
 * durable record. Logs to the console when Resend/CONTACT_EMAIL are unset.
 */
export async function sendSubscriptionRequestEmail({
  clinicName,
  coachName,
  coachEmail,
  planName,
  amount,
  invoiceNumber,
}: {
  clinicName: string;
  coachName: string;
  coachEmail: string;
  planName: string;
  amount: string;
  invoiceNumber: number;
}): Promise<void> {
  const subject = `Assinatura solicitada — ${clinicName} (${planName})`;
  const text = [
    `Clínica: ${clinicName}`,
    `Coach: ${coachName} <${coachEmail}>`,
    `Plano: ${planName}`,
    `Valor: ${amount}`,
    `Fatura: #${invoiceNumber}`,
    "",
    "O coach viu o Pix no app e deve pagar em instantes.",
    `Confira o recebimento e marque a fatura #${invoiceNumber} como paga —`,
    "isso libera o plano na hora.",
  ].join("\n");

  if (!resend || !CONTACT_TO) {
    console.info(
      `[email:dev] subscription request: ${clinicName} → ${planName} (fatura #${invoiceNumber})`,
    );
    return;
  }

  try {
    await resend.emails.send({
      from: FROM,
      to: CONTACT_TO,
      replyTo: coachEmail,
      subject,
      text,
    });
    logger.info("email.sent", { template: "subscription_request" });
  } catch (error) {
    // Swallowed on purpose — see the note above.
    logger.error("email.send_failed", {
      err: error,
      template: "subscription_request",
    });
  }
}
