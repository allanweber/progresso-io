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

export const INVOICE_DUE_EMAIL_SUBJECT = "Sua fatura — Progresso IO";

type InvoiceDueEmailProps = {
  /** Coach's first name, for the greeting. */
  firstName: string;
  /** "vence em 3 dias" / "vence hoje" — the same phrase used in the WhatsApp copy. */
  duePhrase: string;
  /** e.g. "R$ 179,00". */
  amount: string;
  /** e.g. "#0007". */
  invoiceLabel: string;
  /** Opens the coach dashboard, where the billing banner + "Assinar" live. */
  appUrl: string;
};

/**
 * The fatura-due reminder e-mail (issue #99) — the fallback channel for a
 * clinic whose plan is Free, or a paid clinic that never set its WhatsApp
 * contact number in Settings. The PDF is attached by the caller
 * (`sendInvoiceDueEmail`); this body just states what's due and points back
 * at the app, where paying/renewing actually happens.
 */
export function InvoiceDueEmail({
  firstName,
  duePhrase,
  amount,
  invoiceLabel,
  appUrl,
}: InvoiceDueEmailProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{`Sua fatura ${invoiceLabel} ${duePhrase}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>
            Progresso <span style={brandAccent}>IO</span>
          </Text>
          <Heading style={heading}>Sua fatura {duePhrase}</Heading>
          <Text style={paragraph}>
            Oi, {firstName}! A fatura <strong>{invoiceLabel}</strong> da sua
            assinatura, no valor de <strong>{amount}</strong>, {duePhrase}. O
            PDF está em anexo — e você também pode conferir tudo e pagar
            direto pelo app.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Button style={button} href={appUrl}>
              Ver no Progresso IO
            </Button>
          </Section>
          <Text style={muted}>
            Já pagou? Pode ignorar este e-mail — a confirmação é feita pela
            nossa equipe assim que o pagamento é identificado.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InvoiceDueEmail;

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
