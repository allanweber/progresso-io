import { NextResponse } from "next/server";

import { billing } from "@/server/dal";
import { forbidden, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * This clinic's own invoices, read-only for the coach ("Faturas" view). The
 * coach can see the manual ledger the admin keeps but never edits it. Strictly
 * tenant-scoped: {@link billing.listMyInvoices} filters by `ctx.clinicId`, which
 * comes from the session — never from client input. Coach-only.
 */
export const GET = withRoute("coach.invoices.list", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const invoices = await billing.listMyInvoices(ctx);
  return NextResponse.json({ invoices });
});
