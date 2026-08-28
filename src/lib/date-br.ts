/**
 * Brazilian date entry and display, client-safe.
 *
 * Dates are TYPED and SHOWN as `dd/mm/aaaa` everywhere in the product, on every
 * device. That is why this exists: `<input type="date">` renders in the *device*
 * locale, so the same field reads `dd/mm/aaaa` on a Brazilian phone and
 * `mm/dd/yyyy` on a machine set to en-US — an ambiguity that silently turns
 * 03/04 into the wrong month. The fields in `@/components/ui/date-input` are
 * masked text inputs built on these helpers instead.
 *
 * The canonical value crossing the wire and reaching the database is always the
 * ISO `yyyy-mm-dd` string the rest of the app stores; `dd/mm/aaaa` is only ever
 * the presentation.
 */

/** Placeholder for a masked date field. */
export const BR_DATE_PLACEHOLDER = "dd/mm/aaaa";

/**
 * Progressively formats what the user typed as `dd/mm/aaaa`: keeps digits only,
 * caps at 8, and inserts the slashes as they go — so typing `28082026` yields
 * `28/08/2026` with no slash keystrokes. Deleting works naturally because the
 * mask is recomputed from the digits alone.
 */
export function maskBrDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * `dd/mm/aaaa` → canonical `yyyy-mm-dd`, or null when incomplete or not a real
 * calendar date. Rejects 31/02 and friends by round-tripping through UTC, so a
 * rolled-over date never passes as valid.
 */
export function brToIso(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

/** Canonical `yyyy-mm-dd` → `dd/mm/aaaa` ("" for an empty/invalid value). */
export function isoToBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}
