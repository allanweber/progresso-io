import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export const INVITE_EMAIL_SUBJECT = "Seu convite — Progresso IO";

type InviteEmailProps = {
  /** Coach/clinic display name, for the greeting. */
  clinicName: string;
  /** Student's first name, for the greeting. */
  firstName: string;
  /** Absolute URL to the accept page (carries the raw token). */
  acceptUrl: string;
  /** Days until the invite expires, for the copy. */
  expiresInDays: number;
};

/** Branded invite e-mail: a single CTA that opens the set-password page. */
export function InviteEmail({
  clinicName,
  firstName,
  acceptUrl,
  expiresInDays,
}: InviteEmailProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{`${clinicName} convidou você para o Progresso IO`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>
            Progresso <span style={brandAccent}>IO</span>
          </Text>
          <Heading style={heading}>Você foi convidado</Heading>
          <Text style={paragraph}>
            Olá, {firstName}! <strong>{clinicName}</strong> convidou você para
            acessar seus treinos e dietas no Progresso IO. Defina sua senha para
            ativar o acesso.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Button style={button} href={acceptUrl}>
              Ativar meu acesso
            </Button>
          </Section>
          <Text style={muted}>
            O convite expira em {expiresInDays} dias. Se você não esperava este
            e-mail, pode ignorá-lo com segurança.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InviteEmail;

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
  margin: "0 0 8px",
};

const button: React.CSSProperties = {
  backgroundColor: "#059669",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600,
  borderRadius: "10px",
  padding: "12px 24px",
  textDecoration: "none",
};

const muted: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "1.6",
  color: "#94A3B8",
  margin: "24px 0 0",
};
