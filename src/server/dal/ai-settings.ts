import { eq } from "drizzle-orm";

import type { DB } from "@/db";
import { schema } from "@/db";
import {
  DEFAULT_AI_FALLBACK_MODELS,
  DEFAULT_AI_MODEL,
  type AiSettingsDto,
  type AiSettingsValues,
} from "@/lib/ai-settings";

/**
 * The AI model settings: which model drafts programs, and what to fall back to.
 *
 * Platform reference data, like `plan_limit` and `provider_price` — no
 * `clinicId`, managed by admins. It takes a bare `DB` rather than a
 * `TenantContext` for that reason; the routes guard it with `getAdminSession`.
 *
 * **A single row, and possibly no row at all.** Absent means "nobody has chosen
 * yet", which resolves to the coded defaults rather than to an error — a fresh
 * install has to be able to generate before anyone visits an admin screen. The
 * `singleton` UNIQUE column makes a second row impossible, so every read here is
 * unambiguous without an ORDER BY nobody would think to check.
 */

/** The models the provider should ask for. Defaults when nothing is saved. */
export async function getAiSettings(db: DB): Promise<AiSettingsDto> {
  const [row] = await db
    .select()
    .from(schema.aiSettings)
    .where(eq(schema.aiSettings.singleton, true))
    .limit(1);

  if (!row) {
    return {
      model: DEFAULT_AI_MODEL,
      fallbackModels: DEFAULT_AI_FALLBACK_MODELS,
      // Says the values are ours, not a choice someone made — the screen tells
      // an admin whether they are looking at a decision or at a default.
      customized: false,
      updatedAt: null,
    };
  }
  return {
    model: row.model,
    fallbackModels: row.fallbackModels,
    customized: true,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Saves the settings, creating the row on first use.
 *
 * An upsert on `singleton` rather than a read-then-write: two admins saving at
 * once would otherwise both see "no row" and both insert, and the second would
 * fail on the unique index with an error neither of them caused.
 */
export async function updateAiSettings(
  db: DB,
  values: AiSettingsValues,
): Promise<AiSettingsDto> {
  const [row] = await db
    .insert(schema.aiSettings)
    .values({
      singleton: true,
      model: values.model,
      fallbackModels: values.fallbackModels,
    })
    .onConflictDoUpdate({
      target: schema.aiSettings.singleton,
      set: {
        model: values.model,
        fallbackModels: values.fallbackModels,
        updatedAt: new Date(),
      },
    })
    .returning();

  return {
    model: row.model,
    fallbackModels: row.fallbackModels,
    customized: true,
    updatedAt: row.updatedAt.toISOString(),
  };
}
