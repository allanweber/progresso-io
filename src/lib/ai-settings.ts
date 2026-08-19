import { z } from "@/lib/validation";

/**
 * The AI model settings — the client-safe half: defaults, DTO and form contract.
 *
 * **Why these live in the database and not in the environment.** Choosing a
 * model is the one decision about this feature that gets revisited: prices move,
 * slugs get retired, and the whole reason for going through an aggregator is
 * that trying another model should be cheap. An env var makes that a deploy;
 * a row makes it a form. Everything that is *not* revisited — the endpoint, the
 * temperature, the output ceiling, the timeout — stays a constant, because a
 * setting nobody changes is a setting that only adds ways to be misconfigured.
 *
 * The API key is the exception that stays in the environment: it is a secret,
 * and secrets do not belong in a table an admin screen can read back.
 */

/**
 * Defaults, used until an admin saves anything.
 *
 * Cheapest-first, and `:floor` pins each slug to the cheapest host serving it.
 * The fallback is a different model family in a different jurisdiction, so a
 * retired or rate-limited primary degrades rather than taking the feature down.
 *
 * **Verify a slug before trusting it** — `curl https://openrouter.ai/api/v1/models`.
 * Model ids churn; that is exactly why these are a starting point stored in a
 * row, not a constant someone has to edit code to change.
 */
export const DEFAULT_AI_MODEL = "qwen/qwen3.7-flash:floor";
export const DEFAULT_AI_FALLBACK_MODELS = [
  "meta-llama/llama-3.1-8b-instruct:floor",
];

/** The settings as the admin screen reads them. */
export type AiSettingsDto = {
  model: string;
  fallbackModels: string[];
  /** Whether an admin has ever saved — false means these are the defaults. */
  customized: boolean;
  updatedAt: string | null;
};

/**
 * A model slug: `vendor/model`, optionally with a `:variant` suffix.
 *
 * Validated for shape only, never for existence — the catalogue of live slugs is
 * the provider's and changes daily, so a whitelist here would be wrong within a
 * week. A slug that doesn't exist fails loudly at generation time with the
 * provider's own message, which is more useful than a guess from us.
 */
const modelSlug = z
  .string()
  .trim()
  .min(1, "Informe o modelo.")
  .max(120, "Modelo muito longo.")
  .refine(
    (v) => /^[a-zA-Z0-9._\-]+\/[a-zA-Z0-9._\-]+(:[a-zA-Z0-9._\-]+)?$/.test(v),
    'Use o formato "fornecedor/modelo", por exemplo qwen/qwen3.7-flash:floor.',
  );

export const aiSettingsSchema = z.object({
  model: modelSlug,
  /**
   * Tried in order when the primary errors, rate-limits or disappears. An empty
   * list is a real choice ("no fallbacks"), so it is accepted rather than
   * coerced into the defaults.
   */
  fallbackModels: z
    .array(modelSlug)
    .max(5, "No máximo 5 alternativas.")
    .refine(
      (list) => new Set(list).size === list.length,
      "Há alternativas repetidas.",
    ),
});

export type AiSettingsInput = z.input<typeof aiSettingsSchema>;
export type AiSettingsValues = z.output<typeof aiSettingsSchema>;

/**
 * Whether a slug is pinned to its cheapest host.
 *
 * Surfaced in the form because it is the difference between "this model" and
 * "this model at the best price anyone offers it", and the suffix is easy to
 * drop by accident when pasting from a vendor page.
 */
export function isFloored(model: string): boolean {
  return model.trim().endsWith(":floor");
}
