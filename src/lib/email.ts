import { Resend } from "resend";

export type OtpEmailType =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

type SendOtpArgs = {
  email: string;
  otp: string;
  type: OtpEmailType;
};

const FROM = process.env.EMAIL_FROM ?? "Progresso IO <no-reply@progresso.io>";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const COPY: Record<OtpEmailType, { subject: string; heading: string; intro: string }> = {
  "email-verification": {
    subject: "Confirme sua conta — Progresso IO",
    heading: "Confirme sua conta",
    intro: "Use o código abaixo para ativar sua conta no Progresso IO.",
  },
  "forget-password": {
    subject: "Redefina sua senha — Progresso IO",
    heading: "Redefinir senha",
    intro: "Use o código abaixo para redefinir a senha da sua conta.",
  },
  "sign-in": {
    subject: "Seu código de acesso — Progresso IO",
    heading: "Código de acesso",
    intro: "Use o código abaixo para entrar na sua conta.",
  },
  "change-email": {
    subject: "Confirme seu novo e-mail — Progresso IO",
    heading: "Confirmar e-mail",
    intro: "Use o código abaixo para confirmar seu novo endereço de e-mail.",
  },
};

/** Renders the branded OTP e-mail. Exported for testing. */
export function renderOtpEmail(otp: string, type: OtpEmailType): {
  subject: string;
  html: string;
  text: string;
} {
  const copy = COPY[type];
  const text = `${copy.heading}\n\n${copy.intro}\n\nCódigo: ${otp}\n\nO código expira em 10 minutos. Se você não solicitou, ignore este e-mail.`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:440px;margin:0 auto;padding:32px 24px;color:#0F172A">
    <div style="font-weight:700;font-size:18px;margin-bottom:24px">Progresso <span style="color:#059669">IO</span></div>
    <h1 style="font-size:20px;margin:0 0 8px">${copy.heading}</h1>
    <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 24px">${copy.intro}</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:20px;color:#059669">${otp}</div>
    <p style="font-size:13px;line-height:1.6;color:#94A3B8;margin:24px 0 0">O código expira em 10 minutos. Se você não solicitou este e-mail, pode ignorá-lo com segurança.</p>
  </div>`;
  return { subject: copy.subject, html, text };
}

/**
 * Sends an OTP e-mail through Resend. When `RESEND_API_KEY` is not configured
 * (local dev / tests) the code is logged to the server console instead so the
 * flow stays usable without a real e-mail provider.
 */
export async function sendOtpEmail({ email, otp, type }: SendOtpArgs): Promise<void> {
  const { subject, html, text } = renderOtpEmail(otp, type);

  if (!resend) {
    console.info(`[email:dev] OTP for ${email} (${type}): ${otp}`);
    return;
  }

  await resend.emails.send({ from: FROM, to: email, subject, html, text });
}

export type SendOtp = typeof sendOtpEmail;
