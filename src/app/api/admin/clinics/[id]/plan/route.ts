import { NextResponse } from "next/server";

import { db } from "@/db";
import { planChangeSchema } from "@/lib/billing";
import { billing } from "@/server/dal";
import {
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withAdmin } from "@/server/guard";

type Params = { params: Promise<{ id: string }> };

/**
 * Sets a clinic's plan by hand (the functional switch — there is no payment
 * gateway). Changing the plan instantly re-gates the clinic's features (student
 * cap, branded portal) since those read `clinic.plan` live, and logs a
 * `clinic_plan_change` audit row (from→to, admin, note). Admin-only. Invoices are
 * an independent manual ledger — this does NOT touch them. See
 * {@link billing.setClinicPlan}.
 */
export const PUT = withAdmin<Params>(
  "admin.clinics.plan.set",
  async (request, session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Clínica não encontrada.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = planChangeSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await billing.setClinicPlan(
      db,
      id,
      parsed.data.plan,
      session.user.id,
      parsed.data.note ?? null,
    );
    if (!result.ok) return notFound("Clínica não encontrada.");

    if (result.changed) {
      logger.info("admin.clinic.plan_changed", {
        clinicId: id,
        fromPlan: result.fromPlan,
        toPlan: result.toPlan,
        by: session.user.id,
      });
    }
    return NextResponse.json({
      ok: true,
      fromPlan: result.fromPlan,
      toPlan: result.toPlan,
      changed: result.changed,
    });
  },
);
