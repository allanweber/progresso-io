import { NextResponse } from "next/server";

import type { AdminStarterDto } from "@/lib/admin";
import { forbidden } from "@/server/api";
import { STARTER_ANAMNESES } from "@/server/anamneses/starter-templates";
import { withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * The system starter set (key + name + tags) for the "Importar starters" dialog.
 * `STARTER_ANAMNESES` is server-only, so it's surfaced through this admin route.
 */
export const GET = withRoute("admin.anamneses.starters", async () => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const starters: AdminStarterDto[] = STARTER_ANAMNESES.map((s) => ({
    key: s.key,
    name: s.name,
    objective: s.objective,
    modality: s.modality,
  }));
  return NextResponse.json({ starters });
});
