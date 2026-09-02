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

export const ANAMNESIS_EMAIL_SUBJECT = "Sua anamnese — Progresso IO";

type AnamnesisEmailProps = {
  /** Coach/clinic display name, for the greeting. */
  clinicName: string;
  /** Student's first name, for the greeting. */
  firstName: string;
  /** Absolute URL to the public fill page (carries the raw token). */
  fillUrl: string;
};

/**
 * The anamnese request e-mail: one CTA that opens the public fill page.
 *
 * The same link also goes out over WhatsApp. Both channels, always — WhatsApp is
 * where a student actually reads things, and e-mail is the copy that survives,
 * that a free clinic still has, and that a student can find again a week later.
 * Sending only one of them is how an aluno ends up registered and never contacted.
 */
export function AnamnesisEmail({
  clinicName,
  firstName,
  fillUrl,
}: AnamnesisEmailProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{`${clinicName} enviou sua anamnese`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>
            Progresso <span style={brandAccent}>IO</span>
          </Text>
          <Heading style={heading}>Sua anamnese chegou</Heading>
          <Text style={paragraph}>
            Olá, {firstName}! <strong>{clinicName}</strong> preparou um
            questionário para conhecer sua rotina, seu histórico e seus
            objetivos. Leva poucos minutos — e é com base nele que seu treino e
            sua dieta são montados.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Button style={button} href={fillUrl}>
              Responder anamnese
            </Button>
          </Section>
          <Text style={muted}>
            Você vai confirmar seu WhatsApp para abrir o questionário. Assim que
            enviar as respostas, mandamos o acesso à plataforma.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default AnamnesisEmail;

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
  fontSize: "16px",
  fontWeight: 700,
  color: "#0F172A",
  margin: "0 0 24px",
};

const brandAccent: React.CSSProperties = { color: "#059669" };

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#0F172A",
  margin: "0 0 12px",
};

const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#334155",
  margin: "0",
};

const button: React.CSSProperties = {
  backgroundColor: "#059669",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  padding: "12px 24px",
  borderRadius: "10px",
  textDecoration: "none",
};

const muted: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "18px",
  color: "#64748B",
  margin: "0",
};
