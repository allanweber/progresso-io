import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { forbidden } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/** The canonical food groups, for the admin listing/form filters. Admin-only. */
export const GET = withRoute("admin.foods.groups", async () => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const groups = await admin.listFoodGroups(db);
  return NextResponse.json({ groups });
});
