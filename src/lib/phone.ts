/**
 * Phone (WhatsApp) helpers, client-safe (no server/database import) so both the
 * zod schemas and the UI can use them.
 *
 * WhatsApp is the student's primary identifier now, so the number is stored
 * **normalized** (digits only, Brazil `+55` assumed when no country code is
 * given) — that canonical form is what the per-clinic uniqueness index compares.
 * The coach's formatting is only ever a display concern.
 */

/**
 * Reduces a free-typed phone to canonical digits, or null when there's nothing
 * usable. Brazilian numbers are typically typed without the country code
 * (`(11) 99999-0000` → 10–11 digits); we prefix `55` in that case. A number that
 * already carries a country code (12–13 digits) is kept as-is.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // 10 (landline/DDD+8) or 11 (mobile/DDD+9) digits → local Brazilian number.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** True when a value normalizes to a plausible phone (>= 10 digits after +55). */
export function isValidPhone(raw: string | null | undefined): boolean {
  const n = normalizePhone(raw);
  return n !== null && n.length >= 12 && n.length <= 15;
}

/**
 * Formats a normalized Brazilian number for display, e.g.
 * `5511999990000` → `+55 (11) 99999-0000`. Falls back to the raw string when it
 * doesn't look like a BR number.
 */
export function formatPhone(normalized: string | null | undefined): string {
  if (!normalized) return "";
  const d = normalized.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    const mid = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
    const end = rest.length === 9 ? rest.slice(5) : rest.slice(4);
    return `+55 (${ddd}) ${mid}-${end}`;
  }
  return normalized;
}

/**
 * A WhatsApp deep link ("click to chat") for a normalized number — handy for the
 * profile's WhatsApp button. Empty string when there's no number.
 */
export function whatsappHref(normalized: string | null | undefined): string {
  const d = (normalized ?? "").replace(/\D/g, "");
  return d ? `https://wa.me/${d}` : "";
}
