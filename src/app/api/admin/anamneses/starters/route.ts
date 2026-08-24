import { NextResponse } from "next/server";

import type { AdminStarterDto } from "@/lib/admin";
import { STARTER_ANAMNESES } from "@/server/anamneses/starter-templates";
import { withAdmin } from "@/server/guard";

/**
 * The system starter set (key + name + tags) for the "Importar starters" dialog.
 * `STARTER_ANAMNESES` is server-only, so it's surfaced through this admin route.
 */
export const GET = withAdmin("admin.anamneses.starters", async () => {
  const starters: AdminStarterDto[] = STARTER_ANAMNESES.map((s) => ({
    key: s.key,
    name: s.name,
    objective: s.objective,
    modality: s.modality,
  }));
  return NextResponse.json({ starters });
});
