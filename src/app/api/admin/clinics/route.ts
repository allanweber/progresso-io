import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { forbidden } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Clinics (id + name) for the super admin's clinic filter. Admin-only,
 * cross-tenant.
 */
export const GET = withRoute("admin.clinics.list", async () => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const clinics = await admin.listClinics(db);
  return NextResponse.json({ clinics });
});
