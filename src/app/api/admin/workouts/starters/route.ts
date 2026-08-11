import { NextResponse } from "next/server";

import type { AdminTemplateStarterDto } from "@/lib/admin";
import { forbidden } from "@/server/api";
import { STARTER_WORKOUTS } from "@/server/workouts/starter-templates";
import { withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * The system workout starter set (key + name) for the "Importar starters"
 * dialog. `STARTER_WORKOUTS` is server-only, so it's surfaced through this route.
 */
export const GET = withRoute("admin.workouts.starters", async () => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const starters: AdminTemplateStarterDto[] = STARTER_WORKOUTS.map((s) => ({
    key: s.key,
    name: s.name,
  }));
  return NextResponse.json({ starters });
});
