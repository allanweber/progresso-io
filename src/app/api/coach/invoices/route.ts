import { NextResponse } from "next/server";

import { billing } from "@/server/dal";
import { withCoach } from "@/server/guard";

/**
 * This clinic's own invoices, read-only for the coach ("Faturas" view). The
 * coach can see the manual ledger the admin keeps but never edits it. Strictly
 * tenant-scoped: {@link billing.listMyInvoices} filters by `ctx.clinicId`, which
 * comes from the session — never from client input. Coach-only.
 */
export const GET = withCoach("coach.invoices.list", async (_request, ctx) => {
  const invoices = await billing.listMyInvoices(ctx);
  return NextResponse.json({ invoices });
});
