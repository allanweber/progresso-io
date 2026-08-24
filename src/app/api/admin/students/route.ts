import { NextResponse } from "next/server";

import { db } from "@/db";
import { adminStudentFilterSchema } from "@/lib/admin";
import { admin } from "@/server/dal";
import { validationError } from "@/server/api";
import { withAdmin } from "@/server/guard";

/**
 * Platform-wide student list for the super admin, filterable by clinic and
 * e-mail. Admin-only (gated by {@link getAdminSession}); filters validated with
 * zod; the query is cross-tenant by design and runs through the admin DAL.
 */
export const GET = withAdmin("admin.students.list", async (request) => {
  const params = new URL(request.url).searchParams;
  const parsed = adminStudentFilterSchema.safeParse({
    clinicId: params.get("clinicId") || undefined,
    email: params.get("email") || undefined,
  });
  if (!parsed.success) return validationError(parsed.error);

  const students = await admin.listAllStudents(db, parsed.data);
  return NextResponse.json({ students });
});
