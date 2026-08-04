import { render } from "@react-email/render";
import { Resend } from "resend";

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
  if (!resend) {
    console.info(`[email:dev] OTP for ${email} (${type}): ${otp}`);
    return;
  }

  const { subject, html, text } = await renderOtpEmail(otp, type);
  await resend.emails.send({ from: FROM, to: email, subject, html, text });
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
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: INVITE_EMAIL_SUBJECT,
    html,
    text,
  });
}

export type SendInvite = typeof sendInviteEmail;

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

  await resend.emails.send({
    from: FROM,
    to: CONTACT_TO,
    replyTo: email,
    subject,
    text,
  });
}
