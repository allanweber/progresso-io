import { z } from "zod";

/**
 * LLM price list — the client-safe half: DTO, form contract, and the two pure
 * functions that decide what a generation cost.
 *
 * Prices are quoted by vendors as decimal USD per **million** tokens ($0.03/M).
 * They are stored and passed around as **micro-USD per million tokens**
 * (`0.03` → `30000`) so nothing is ever a float: a month of summing floating
 * point drifts, and money that drifts is money nobody trusts. The form takes
 * the decimal a human reads off a pricing page and converts at the boundary.
 */

/** A price row as the admin screen lists it. `effectiveFrom` is an ISO string. */
export type ProviderPriceDto = {
  id: string;
  provider: string;
  model: string;
  effectiveFrom: string;
  inputMicroUsdPerMtok: number;
  outputMicroUsdPerMtok: number;
  cachedInputMicroUsdPerMtok: number | null;
  note: string | null;
};

/** The shape the resolver needs — satisfied by both the DTO and the DB row. */
export type PriceLike = {
  provider: string;
  model: string;
  effectiveFrom: Date | string;
  inputMicroUsdPerMtok: number;
  outputMicroUsdPerMtok: number;
  cachedInputMicroUsdPerMtok: number | null;
};

/** Token counts as the audit row records them — any of them may be missing. */
export type UsageLike = {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
};

/**
 * A decimal USD-per-million-tokens amount, as typed into the form, converted to
 * micro-USD. Accepts `0,03` as well as `0.03` — the admin UI is pt-BR, where the
 * comma is the decimal separator, and a vendor page copied into a pt-BR browser
 * is exactly where this value comes from.
 *
 * Rejects blank rather than coercing it: `Number("")` is `0`, and a price of
 * zero is a real, meaningful value ("this model is free"), so the two must not
 * collapse into each other.
 */
const decimalUsdPerMTok = z
  .string()
  .trim()
  .min(1, "Informe o preço.")
  .transform((raw) => raw.replace(",", "."))
  .refine((v) => /^\d+(\.\d+)?$/.test(v), "Use um número, por exemplo 0,03.")
  .transform((v) => Math.round(Number(v) * 1_000_000))
  .refine(
    (v) => Number.isFinite(v) && v >= 0 && v <= 2_000_000_000,
    "Preço fora do intervalo aceito.",
  );

/** The same, but optional — blank means "vendor didn't state a cached rate". */
const optionalDecimalUsdPerMTok = z
  .string()
  .trim()
  .transform((raw) => (raw === "" ? null : raw.replace(",", ".")))
  .refine(
    (v) => v === null || /^\d+(\.\d+)?$/.test(v),
    "Use um número, por exemplo 0,003.",
  )
  .transform((v) => (v === null ? null : Math.round(Number(v) * 1_000_000)))
  .refine(
    (v) => v === null || (v >= 0 && v <= 2_000_000_000),
    "Preço fora do intervalo aceito.",
  );

export const providerPriceSchema = z.object({
  provider: z.string().trim().min(1, "Informe o provedor.").max(80),
  model: z.string().trim().min(1, "Informe o modelo.").max(120),
  // `datetime-local` gives "2026-08-16T14:30" — no zone, no seconds.
  effectiveFrom: z
    .string()
    .trim()
    .min(1, "Informe a data de vigência.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Data inválida."),
  inputUsdPerMtok: decimalUsdPerMTok,
  outputUsdPerMtok: decimalUsdPerMTok,
  cachedInputUsdPerMtok: optionalDecimalUsdPerMTok,
  note: z
    .string()
    .trim()
    .max(300, "Observação muito longa.")
    .transform((v) => (v === "" ? null : v))
    .nullable(),
});

export type ProviderPriceInput = z.input<typeof providerPriceSchema>;
export type ProviderPriceValues = z.output<typeof providerPriceSchema>;

/**
 * The price in force for `provider`/`model` at instant `at`, or `null` if none
 * is — either because no price was ever entered for that model, or because the
 * earliest one starts after the generation ran.
 *
 * Greatest `effectiveFrom` at or before `at` wins. Rows dated in the future are
 * ignored until their day comes, which is what makes entering an announced
 * price change ahead of time safe.
 */
export function priceAt<T extends PriceLike>(
  prices: readonly T[],
  provider: string,
  model: string,
  at: Date,
): T | null {
  let best: T | null = null;
  let bestTime = -Infinity;
  for (const price of prices) {
    if (price.provider !== provider || price.model !== model) continue;
    const from = new Date(price.effectiveFrom).getTime();
    if (from > at.getTime()) continue;
    if (from > bestTime) {
      best = price;
      bestTime = from;
    }
  }
  return best;
}

/**
 * What one generation cost, in millionths of a USD.
 *
 * Cache reads bill at their own rate when the vendor states one; when they
 * don't, they bill as normal input — over- rather than under-stating, which is
 * the safe direction for an unknown discount.
 */
export function costMicroUsd(usage: UsageLike, price: PriceLike): number {
  const cachedRate =
    price.cachedInputMicroUsdPerMtok ?? price.inputMicroUsdPerMtok;
  const per = (tokens: number | null, rate: number) =>
    ((tokens ?? 0) * rate) / 1_000_000;
  return Math.round(
    per(usage.inputTokens, price.inputMicroUsdPerMtok) +
      per(usage.cachedInputTokens, cachedRate) +
      per(usage.outputTokens, price.outputMicroUsdPerMtok),
  );
}

/**
 * Micro-USD as money. A single generation costs fractions of a cent, so a fixed
 * 2-decimal format would render every real figure as "US$ 0,00"; the precision
 * follows the magnitude instead.
 */
export function formatMicroUsd(micro: number | null): string {
  if (micro === null) return "—";
  const usd = micro / 1_000_000;
  const digits = usd >= 1 ? 2 : usd >= 0.01 ? 4 : 6;
  return `US$ ${usd.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** Micro-USD per million tokens back to the decimal a vendor page quotes. */
export function formatUsdPerMtok(micro: number | null): string {
  if (micro === null) return "—";
  return `US$ ${(micro / 1_000_000).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })}`;
}

/** Prefills the edit form from a stored row (micro-USD back to decimals). */
export function toPriceFormValues(row: ProviderPriceDto): ProviderPriceInput {
  const dec = (micro: number | null) =>
    micro === null ? "" : String(micro / 1_000_000);
  return {
    provider: row.provider,
    model: row.model,
    // `datetime-local` wants "YYYY-MM-DDTHH:mm" with no zone or seconds.
    effectiveFrom: new Date(row.effectiveFrom).toISOString().slice(0, 16),
    inputUsdPerMtok: dec(row.inputMicroUsdPerMtok),
    outputUsdPerMtok: dec(row.outputMicroUsdPerMtok),
    cachedInputUsdPerMtok: dec(row.cachedInputMicroUsdPerMtok),
    note: row.note ?? "",
  };
}
