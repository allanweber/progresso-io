import { NextResponse } from "next/server";

import type { AdminTemplateStarterDto } from "@/lib/admin";
import { forbidden } from "@/server/api";
import { STARTER_DIETS } from "@/server/diets/starter-templates";
import { withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * The system diet starter set (key + name) for the "Importar starters" dialog.
 * `STARTER_DIETS` is server-only, so it's surfaced through this admin route.
 */
export const GET = withRoute("admin.diets.starters", async () => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const starters: AdminTemplateStarterDto[] = STARTER_DIETS.map((s) => ({
    key: s.key,
    name: s.name,
  }));
  return NextResponse.json({ starters });
});
