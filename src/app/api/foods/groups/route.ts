import { NextResponse } from "next/server";

import { foods } from "@/server/dal";
import { forbidden, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/** The canonical food groups, for the Alimentos listing's group filter. */
export const GET = withRoute("foods.groups", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const groups = await foods.listFoodGroups(ctx);
  return NextResponse.json({ groups });
});
