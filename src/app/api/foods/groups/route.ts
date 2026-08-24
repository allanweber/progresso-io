import { NextResponse } from "next/server";

import { foods } from "@/server/dal";
import { withCoach } from "@/server/guard";

/** The canonical food groups, for the Alimentos listing's group filter. */
export const GET = withCoach("foods.groups", async (_request, ctx) => {
  const groups = await foods.listFoodGroups(ctx);
  return NextResponse.json({ groups });
});
