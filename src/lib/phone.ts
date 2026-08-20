/**
 * Phone (WhatsApp) helpers, client-safe (no server/database import) so both the
 * zod schemas and the UI can use them.
 *
 * WhatsApp is the student's primary identifier now, so the number is stored
 * **normalized** — E.164 digits, no `+`, Brazil `55` assumed when the coach
 * types a bare local number — and that canonical form is what the per-clinic
 * uniqueness index compares. The coach's formatting is only ever a display
 * concern: {@link formatPhone} puts the `+` back.
 */

/**
 * Two-digit country codes. Everything else that starts with 2–9 is a
 * three-digit code, and `1`/`7` are the two single-digit ones. This is the
 * standard ITU allocation, and it's all we need to tell the country code apart
 * from the national number — which is what lets us drop a national trunk `0`.
 */
const TWO_DIGIT_COUNTRY_CODES = new Set([
  20, 27, 30, 31, 32, 33, 34, 36, 39, 40, 41, 43, 44, 45, 46, 47, 48, 49, 51,
  52, 53, 54, 55, 56, 57, 58, 60, 61, 62, 63, 64, 65, 66, 81, 82, 84, 86, 90,
  91, 92, 93, 94, 95, 98,
]);

/**
 * Countries whose national numbers KEEP their leading zero — Italy is the
 * famous one (`+39 06 …` is Rome, the `0` is part of the number). For those we
 * never strip the trunk prefix.
 */
const KEEPS_LEADING_ZERO = new Set(["39"]);

/** Length of the country code at the head of an E.164 digit string. */
function countryCodeLength(digits: string): number {
  if (digits.startsWith("1") || digits.startsWith("7")) return 1;
  return TWO_DIGIT_COUNTRY_CODES.has(Number(digits.slice(0, 2))) ? 2 : 3;
}

/**
 * Drops the national trunk prefix from a number that already carries a country
 * code: people write their number the way they'd dial it at home
 * (`+31 06 3605 1199`), but E.164 — and therefore WhatsApp — wants
 * `31636051199`. Without this the stored number is one that can never be
 * reached, and no confirmation screen would ever match it.
 */
function stripTrunkPrefix(digits: string): string {
  const cc = digits.slice(0, countryCodeLength(digits));
  const national = digits.slice(cc.length);
  if (KEEPS_LEADING_ZERO.has(cc) || !national.startsWith("0")) return digits;
  return `${cc}${national.replace(/^0+/, "")}`;
}

/**
 * Reduces a free-typed phone to canonical E.164 digits, or null when there's
 * nothing usable.
 *
 * A number typed with an explicit country code — a leading `+` or the `00`
 * international prefix — is taken at its word: it is NEVER given a Brazilian
 * `55`, and its national trunk `0` is dropped. Brazilian numbers are typically
 * typed without the country code (`(11) 99999-0000` → 10–11 digits); we prefix
 * `55` in that case.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // `+55 …` and `0055 …` both mean "the country code is right here".
  let explicitCountryCode = trimmed.startsWith("+");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    explicitCountryCode = true;
  }
  if (!digits) return null;

  // 10 (landline/DDD+8) or 11 (mobile/DDD+9) digits → local Brazilian number,
  // but only when the typist didn't say otherwise.
  if (!explicitCountryCode && (digits.length === 10 || digits.length === 11)) {
    return `55${digits}`;
  }
  return stripTrunkPrefix(digits);
}

/** True when a value normalizes to a plausible international number. */
export function isValidPhone(raw: string | null | undefined): boolean {
  const n = normalizePhone(raw);
  return n !== null && n.length >= 10 && n.length <= 15;
}

/**
 * True when two free-typed numbers are the same line. Exact canonical equality
 * first; otherwise the last 8 digits (the subscriber number, which no national
 * formatting convention touches) have to agree.
 *
 * The tolerance is deliberate: the coach and the aluno type the same number in
 * different shapes — with or without `+55`, with or without the trunk `0`, with
 * or without the mobile 9th digit — and numbers stored before this module
 * canonicalized trunk prefixes still carry the old shape. Where this is used to
 * gate access (the anamnese fill link) the number is a second factor behind a
 * single-use token and the attempts are rate-limited, so trading exactness for
 * "the aluno's own number is accepted" is the right call.
 */
export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length < 8 || nb.length < 8) return false;
  return na.slice(-8) === nb.slice(-8);
}

/**
 * Formats a normalized number for display, e.g. `5511999990000` →
 * `+55 (11) 99999-0000`. Numbers outside Brazil keep the `+` and are split
 * country code / national number (`31636051199` → `+31 636051199`) — without
 * the `+` a coach can't tell an international number from a mangled one.
 */
export function formatPhone(normalized: string | null | undefined): string {
  if (!normalized) return "";
  const d = normalized.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    const mid = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
    const end = rest.length === 9 ? rest.slice(5) : rest.slice(4);
    return `+55 (${ddd}) ${mid}-${end}`;
  }
  // Too short to carry a country code — nothing to format, show it as typed.
  if (d.length < 8) return normalized;
  const cc = d.slice(0, countryCodeLength(d));
  return `+${cc} ${d.slice(cc.length)}`;
}

/**
 * A WhatsApp deep link ("click to chat") for a normalized number — handy for the
 * profile's WhatsApp button. Empty string when there's no number.
 */
export function whatsappHref(normalized: string | null | undefined): string {
  const d = (normalized ?? "").replace(/\D/g, "");
  return d ? `https://wa.me/${d}` : "";
}
