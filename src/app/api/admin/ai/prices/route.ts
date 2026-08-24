import { NextResponse } from "next/server";

import { db } from "@/db";
import { providerPriceSchema } from "@/lib/provider-prices";
import { providerPrices } from "@/server/dal";
import { fieldConflict, readJson, validationError } from "@/server/api";
import { logger } from "@/server/observability";
import { withAdmin } from "@/server/guard";

/**
 * The LLM price list. Platform reference data, so admin-only and cross-tenant
 * (`getAdminSession`, not a TenantContext) — same posture as the admin catalog
 * routes.
 */

export const GET = withAdmin("admin.ai.prices.list", async () => {
  const rows = await providerPrices.listProviderPrices(db);
  return NextResponse.json({
    prices: rows.map(providerPrices.toProviderPriceDto),
  });
});

export const POST = withAdmin("admin.ai.prices.create", async (request) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = providerPriceSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const result = await providerPrices.createProviderPrice(db, parsed.data);
  if (!result.ok) {
    // Scoped to the date field: the provider/model pair is legitimately
    // repeated across rows — it is the *instant* that has to be unique.
    const m = "Já existe um preço para este modelo nesta data.";
    return fieldConflict(m, { effectiveFrom: m });
  }
  logger.info("admin.ai.price.created", {
    provider: parsed.data.provider,
    model: parsed.data.model,
  });
  return NextResponse.json(
    { price: providerPrices.toProviderPriceDto(result.row) },
    { status: 201 },
  );
});
