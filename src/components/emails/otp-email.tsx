import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type OtpEmailType =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

/** Subject line + in-body copy for each OTP flow (PT-BR). */
export const OTP_EMAIL_COPY: Record<
  OtpEmailType,
  { subject: string; heading: string; intro: string }
> = {
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

type OtpEmailProps = {
  otp: string;
  type: OtpEmailType;
};

/** Branded OTP e-mail rendered by React Email. */
export function OtpEmail({ otp, type }: OtpEmailProps) {
  const copy = OTP_EMAIL_COPY[type];

  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{`${copy.heading}: ${otp}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>
            Progresso <span style={brandAccent}>IO</span>
          </Text>
          <Heading style={heading}>{copy.heading}</Heading>
          <Text style={paragraph}>{copy.intro}</Text>
          <Section style={codeBox}>
            <Text style={code}>{otp}</Text>
          </Section>
          <Text style={muted}>
            O código expira em 10 minutos. Se você não solicitou este e-mail,
            pode ignorá-lo com segurança.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default OtpEmail;

/* ------------------------------- styles --------------------------------- */

const main: React.CSSProperties = {
  backgroundColor: "#F8FAFC",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  padding: "24px 0",
};

const container: React.CSSProperties = {
  maxWidth: "440px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  borderRadius: "16px",
  padding: "32px 24px",
};

const brand: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "18px",
  color: "#0F172A",
  margin: "0 0 24px",
};

const brandAccent: React.CSSProperties = { color: "#059669" };

const heading: React.CSSProperties = {
  fontSize: "20px",
  color: "#0F172A",
  margin: "0 0 8px",
};

const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "1.6",
  color: "#475569",
  margin: "0 0 24px",
};

const codeBox: React.CSSProperties = {
  backgroundColor: "#F0FDF4",
  border: "1px solid #BBF7D0",
  borderRadius: "16px",
  padding: "20px",
  textAlign: "center",
};

const code: React.CSSProperties = {
  fontSize: "32px",
  fontWeight: 700,
  letterSpacing: "8px",
  color: "#059669",
  margin: 0,
};

const muted: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "1.6",
  color: "#94A3B8",
  margin: "24px 0 0",
};
