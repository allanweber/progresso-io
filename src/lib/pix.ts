/**
 * Pix "copia e cola" (BR Code) generation — pure string building, no deps.
 *
 * A BR Code is an **EMV MPM** payload: a flat sequence of `ID + LENGTH + VALUE`
 * fields, closed by a CRC16 checksum. Nothing about it requires a payment
 * gateway or a CNPJ — Pix settles bank-to-bank off a Pix key, and a pessoa
 * física can hold one. That is what lets the app take real money before the
 * Asaas integration exists (roadmap item 0, Phase 2): the coach pays instantly,
 * and only the *confirmation* stays manual.
 *
 * Deliberately dependency-free so it is cheap to import anywhere, and pure so
 * it is exhaustively unit-testable (a BR Code is fully determined by its input).
 *
 * Reference: BCB "Manual de Padrões para Iniciação do Pix" / EMV® QRCPS-MPM.
 */

/** Field IDs used here (the subset a static amount-bearing BR Code needs). */
const ID_PAYLOAD_FORMAT = "00";
const ID_POINT_OF_INITIATION = "01";
const ID_MERCHANT_ACCOUNT = "26";
const ID_MERCHANT_CATEGORY = "52";
const ID_CURRENCY = "53";
const ID_AMOUNT = "54";
const ID_COUNTRY = "58";
const ID_MERCHANT_NAME = "59";
const ID_MERCHANT_CITY = "60";
const ID_ADDITIONAL_DATA = "62";
const ID_CRC = "63";

/** The Pix domain inside the merchant-account template. */
const PIX_GUI = "br.gov.bcb.pix";
/** 986 = BRL. */
const CURRENCY_BRL = "986";
const COUNTRY_BR = "BR";
/** "Not specified" — we are not a classified merchant category. */
const MCC_UNSPECIFIED = "0000";

/** `ID + 2-digit length + value`. Length counts characters, not bytes. */
function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, no final XOR) —
 * the checksum the BR Code spec mandates, computed over the whole payload
 * *including* the trailing "6304" marker.
 */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Strips accents and anything outside the printable ASCII the spec allows, then
 * upper-cases and truncates. Readers are strict here, and an accented merchant
 * name is a common reason a QR is rejected.
 */
function ascii(value: string, maxLength: number): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
}

/**
 * A transaction id: alphanumeric only, 1–25 chars. `***` is the spec's "none".
 * We key it to the invoice so a bank statement can be reconciled by eye.
 */
export function pixTxid(reference: string): string {
  const clean = reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  return clean.length > 0 ? clean : "***";
}

export type PixPayloadInput = {
  /** The receiving Pix key (CPF/CNPJ, phone, e-mail or random). */
  key: string;
  /** Payee name as it appears in the payer's app (≤25 chars after cleaning). */
  merchantName: string;
  /** Payee city (≤15 chars after cleaning). */
  merchantCity: string;
  /** Amount in **cents**; omitted from the code when null (payer types it). */
  amountCents: number | null;
  /** Reconciliation reference — the invoice number. */
  reference: string;
};

/**
 * Builds the copia-e-cola string. The same input always produces the same
 * output, so this is safe to regenerate on every render rather than stored.
 */
export function buildPixPayload(input: PixPayloadInput): string {
  const merchantAccount =
    field("00", PIX_GUI) + field("01", input.key.trim());

  // Amount is decimal with a dot and exactly two places, no thousands separator.
  const amount =
    input.amountCents === null
      ? ""
      : field(ID_AMOUNT, (input.amountCents / 100).toFixed(2));

  const additionalData = field("05", pixTxid(input.reference));

  const payload =
    field(ID_PAYLOAD_FORMAT, "01") +
    // 12 = reusable. The same code may be paid again next month.
    field(ID_POINT_OF_INITIATION, "12") +
    field(ID_MERCHANT_ACCOUNT, merchantAccount) +
    field(ID_MERCHANT_CATEGORY, MCC_UNSPECIFIED) +
    field(ID_CURRENCY, CURRENCY_BRL) +
    amount +
    field(ID_COUNTRY, COUNTRY_BR) +
    field(ID_MERCHANT_NAME, ascii(input.merchantName, 25)) +
    field(ID_MERCHANT_CITY, ascii(input.merchantCity, 15)) +
    field(ID_ADDITIONAL_DATA, additionalData);

  // The CRC field's own ID+length participate in the checksum.
  const withCrcMarker = `${payload}${ID_CRC}04`;
  return `${withCrcMarker}${crc16(withCrcMarker)}`;
}

/**
 * The configured Pix receiver, or `null` when Pix isn't set up — the app stays
 * dormant-until-configured, like Sentry/R2/WhatsApp elsewhere in the codebase.
 * Server-only: these are not `NEXT_PUBLIC_*`, so the key never reaches a bundle.
 */
export function pixReceiver(): {
  key: string;
  merchantName: string;
  merchantCity: string;
} | null {
  const key = process.env.PIX_KEY?.trim();
  if (!key) return null;
  return {
    key,
    merchantName: process.env.PIX_MERCHANT_NAME?.trim() || "Progresso IO",
    merchantCity: process.env.PIX_MERCHANT_CITY?.trim() || "SAO PAULO",
  };
}
