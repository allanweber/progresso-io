import { NextResponse } from "next/server";

import { db } from "@/db";
import { providerPriceSchema } from "@/lib/provider-prices";
import { providerPrices } from "@/server/dal";
import {
  fieldConflict,
  forbidden,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/** Edit or remove one price row. Admin-only; see the collection route. */

type Params = { params: Promise<{ id: string }> };

export const PATCH = withRoute(
  "admin.ai.prices.update",
  async (request, { params }: Params) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Preço não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = providerPriceSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await providerPrices.updateProviderPrice(db, id, parsed.data);
    if (!result.ok) {
      if (result.reason === "not_found") return notFound("Preço não encontrado.");
      const m = "Já existe um preço para este modelo nesta data.";
      return fieldConflict(m, { effectiveFrom: m });
    }
    logger.info("admin.ai.price.updated", { id });
    return NextResponse.json({
      price: providerPrices.toProviderPriceDto(result.row),
    });
  },
);

export const DELETE = withRoute(
  "admin.ai.prices.delete",
  async (_request, { params }: Params) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Preço não encontrado.");

    const removed = await providerPrices.deleteProviderPrice(db, id);
    if (!removed) return notFound("Preço não encontrado.");
    logger.info("admin.ai.price.deleted", { id });
    return NextResponse.json({ ok: true });
  },
);
