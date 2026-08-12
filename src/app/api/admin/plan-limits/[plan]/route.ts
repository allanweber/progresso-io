import { NextResponse } from "next/server";

import { db } from "@/db";
import { PLANS, type Plan } from "@/db/schema";
import {
  type AdminPlanLimitDto,
  planDisplayName,
  planLimitUpdateSchema,
} from "@/lib/admin";
import { admin } from "@/server/dal";
import {
  forbidden,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

type Params = { params: Promise<{ plan: string }> };

/**
 * Updates one plan's caps + WhatsApp flag (upsert, so an unseeded plan is
 * created). Admin-only. The `plan` route param is validated against the plan
 * enum; every field is zod-validated. `null` caps mean unlimited.
 */
export const PUT = withRoute<Params>(
  "admin.planLimits.update",
  async (request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { plan } = await params;
    if (!PLANS.includes(plan as Plan)) {
      return notFound("Plano não encontrado.");
    }

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = planLimitUpdateSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const row = await admin.upsertPlanLimit(db, plan as Plan, parsed.data);
    logger.info("admin.planLimit.updated", { plan, by: session.user.id });

    return NextResponse.json({
      plan: row.plan,
      planName: planDisplayName(row.plan),
      maxStudents: row.maxStudents,
      maxCoaches: row.maxCoaches,
      whatsapp: row.whatsapp,
    } satisfies AdminPlanLimitDto);
  },
);
