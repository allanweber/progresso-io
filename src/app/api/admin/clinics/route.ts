import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { withAdmin } from "@/server/guard";

/**
 * Clinics for the super admin. Returns each clinic enriched with its owner and
 * coach/student counts (the "Clínicas" manager payload); the various admin
 * screens' clinic filters read just the id + name off the same list. Admin-only,
 * cross-tenant.
 */
export const GET = withAdmin("admin.clinics.list", async () => {
  const clinics = await admin.listAllClinics(db);
  return NextResponse.json({ clinics });
});
