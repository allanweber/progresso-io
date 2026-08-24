import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { withAdmin } from "@/server/guard";

/** The canonical food groups, for the admin listing/form filters. Admin-only. */
export const GET = withAdmin("admin.foods.groups", async () => {
  const groups = await admin.listFoodGroups(db);
  return NextResponse.json({ groups });
});
