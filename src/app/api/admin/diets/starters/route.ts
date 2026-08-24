import { NextResponse } from "next/server";

import type { AdminTemplateStarterDto } from "@/lib/admin";
import { STARTER_DIETS } from "@/server/diets/starter-templates";
import { withAdmin } from "@/server/guard";

/**
 * The system diet starter set (key + name) for the "Importar starters" dialog.
 * `STARTER_DIETS` is server-only, so it's surfaced through this admin route.
 */
export const GET = withAdmin("admin.diets.starters", async () => {
  const starters: AdminTemplateStarterDto[] = STARTER_DIETS.map((s) => ({
    key: s.key,
    name: s.name,
  }));
  return NextResponse.json({ starters });
});
