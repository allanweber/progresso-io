import { NextResponse } from "next/server";

import type { AdminTemplateStarterDto } from "@/lib/admin";
import { STARTER_WORKOUTS } from "@/server/workouts/starter-templates";
import { withAdmin } from "@/server/guard";

/**
 * The system workout starter set (key + name) for the "Importar starters"
 * dialog. `STARTER_WORKOUTS` is server-only, so it's surfaced through this route.
 */
export const GET = withAdmin("admin.workouts.starters", async () => {
  const starters: AdminTemplateStarterDto[] = STARTER_WORKOUTS.map((s) => ({
    key: s.key,
    name: s.name,
  }));
  return NextResponse.json({ starters });
});
