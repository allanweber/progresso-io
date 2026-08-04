import { render } from "@react-email/render";
import { Resend } from "resend";

import {
  OTP_EMAIL_COPY,
  OtpEmail,
  type OtpEmailType,
} from "@/components/emails/otp-email";

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
