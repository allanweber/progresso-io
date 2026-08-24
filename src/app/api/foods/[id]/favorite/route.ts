import { NextResponse } from "next/server";

import { foods } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/**
 * A food's favorite state for the clinic. PUT marks it, DELETE unmarks it —
 * both idempotent. Coach-only; the DAL scopes the favorite to `ctx.clinicId`
 * and only allows favoriting a food the clinic can see.
 */
type Params = { params: Promise<{ id: string }> };

export const PUT = withCoach<Params>(
  "foods.favorite.add",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Alimento não encontrado.");

    const ok = await foods.setFavorite(ctx, id, true);
    if (!ok) return notFound("Alimento não encontrado.");
    logger.info("food.favorited", { foodId: id });
    return NextResponse.json({ isFavorite: true });
  },
);

export const DELETE = withCoach<Params>(
  "foods.favorite.remove",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Alimento não encontrado.");

    const ok = await foods.setFavorite(ctx, id, false);
    if (!ok) return notFound("Alimento não encontrado.");
    logger.info("food.unfavorited", { foodId: id });
    return NextResponse.json({ isFavorite: false });
  },
);
