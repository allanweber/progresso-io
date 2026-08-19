import { and, asc, desc, eq, ne } from "drizzle-orm";

import type { DB } from "@/db";
import { schema } from "@/db";
import type { ProviderPriceDto, ProviderPriceValues } from "@/lib/provider-prices";

/**
 * LLM price list. Platform reference data, like `plan_limit` — **not**
 * tenant-scoped, so these take a bare `DB` and are only ever reached through
 * admin-guarded routes, never through a `TenantContext`.
 *
 * Rows are appended rather than overwritten: see the table comment in
 * `src/db/schema.ts` for why effective-dating is the point.
 */

export function toProviderPriceDto(
  row: typeof schema.providerPrice.$inferSelect,
): ProviderPriceDto {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    effectiveFrom: row.effectiveFrom.toISOString(),
    inputMicroUsdPerMtok: row.inputMicroUsdPerMtok,
    outputMicroUsdPerMtok: row.outputMicroUsdPerMtok,
    cachedInputMicroUsdPerMtok: row.cachedInputMicroUsdPerMtok,
    note: row.note,
  };
}

/**
 * Every price, newest first within a model — the order the admin table reads
 * in, since the current price is the one you look for.
 */
export async function listProviderPrices(db: DB) {
  return db
    .select()
    .from(schema.providerPrice)
    .orderBy(
      asc(schema.providerPrice.provider),
      asc(schema.providerPrice.model),
      desc(schema.providerPrice.effectiveFrom),
    );
}

/** Why a write was rejected. `duplicate` = same model + same instant. */
export type PriceWriteResult =
  | { ok: true; row: typeof schema.providerPrice.$inferSelect }
  | { ok: false; reason: "duplicate" | "not_found" };

/**
 * Whether another row already claims this (provider, model, effectiveFrom).
 *
 * The unique index is the real guarantee; this exists so the API can answer
 * with a field-scoped PT-BR message instead of surfacing a constraint violation
 * as a 500.
 */
async function collides(
  db: DB,
  values: ProviderPriceValues,
  excludeId?: string,
): Promise<boolean> {
  const where = and(
    eq(schema.providerPrice.provider, values.provider),
    eq(schema.providerPrice.model, values.model),
    eq(schema.providerPrice.effectiveFrom, new Date(values.effectiveFrom)),
    ...(excludeId ? [ne(schema.providerPrice.id, excludeId)] : []),
  );
  const [row] = await db
    .select({ id: schema.providerPrice.id })
    .from(schema.providerPrice)
    .where(where)
    .limit(1);
  return row !== undefined;
}

export async function createProviderPrice(
  db: DB,
  values: ProviderPriceValues,
): Promise<PriceWriteResult> {
  if (await collides(db, values)) return { ok: false, reason: "duplicate" };
  const [row] = await db
    .insert(schema.providerPrice)
    .values({
      provider: values.provider,
      model: values.model,
      effectiveFrom: new Date(values.effectiveFrom),
      inputMicroUsdPerMtok: values.inputUsdPerMtok,
      outputMicroUsdPerMtok: values.outputUsdPerMtok,
      cachedInputMicroUsdPerMtok: values.cachedInputUsdPerMtok,
      note: values.note,
    })
    .returning();
  return { ok: true, row };
}

export async function updateProviderPrice(
  db: DB,
  id: string,
  values: ProviderPriceValues,
): Promise<PriceWriteResult> {
  if (await collides(db, values, id)) return { ok: false, reason: "duplicate" };
  const [row] = await db
    .update(schema.providerPrice)
    .set({
      provider: values.provider,
      model: values.model,
      effectiveFrom: new Date(values.effectiveFrom),
      inputMicroUsdPerMtok: values.inputUsdPerMtok,
      outputMicroUsdPerMtok: values.outputUsdPerMtok,
      cachedInputMicroUsdPerMtok: values.cachedInputUsdPerMtok,
      note: values.note,
      updatedAt: new Date(),
    })
    .where(eq(schema.providerPrice.id, id))
    .returning();
  return row ? { ok: true, row } : { ok: false, reason: "not_found" };
}

/**
 * Deletes a price row. Nothing references it — generations are matched to a
 * price by (provider, model, date) at read time, not by a foreign key — so this
 * is a plain delete. The consequence is that generations in the window this row
 * covered go back to reading as unpriced, which the overview reports rather
 * than hides.
 */
export async function deleteProviderPrice(db: DB, id: string): Promise<boolean> {
  const [row] = await db
    .delete(schema.providerPrice)
    .where(eq(schema.providerPrice.id, id))
    .returning({ id: schema.providerPrice.id });
  return row !== undefined;
}
