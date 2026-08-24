import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  type AdminClinicLimitsDto,
  clinicLimitsUpdateSchema,
} from "@/lib/admin";
import {
  PLAN_DEFAULT_AI_GENERATIONS,
  PLAN_DEFAULT_ARCHIVE,
  PLAN_DEFAULT_CALENDAR,
  PLAN_META,
} from "@/lib/plans";
import { admin } from "@/server/dal";
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
 * Sets a clinic's per-clinic capability overrides (máx. alunos, máx. coaches,
 * WhatsApp). Each override is nullable — `null` inherits the plan default, a
 * value wins for this clinic only. Admin-only; every field zod-validated. Does
 * NOT change the clinic's plan (that's the separate plan route).
 */
export const PUT = withAdmin<Params>(
  "admin.clinics.limits",
  async (request, session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Clínica não encontrada.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = clinicLimitsUpdateSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const row = await admin.updateClinicLimits(db, id, parsed.data);
    if (!row) return notFound("Clínica não encontrada.");

    logger.info("admin.clinic.limits_updated", { clinicId: id, by: session.user.id });

    const limits: AdminClinicLimitsDto = {
      plan: row.plan,
      planName: PLAN_META[row.plan]?.name ?? row.plan,
      planMaxStudents: row.planMaxStudents,
      planMaxCoaches: row.planMaxCoaches,
      planWhatsapp: row.planWhatsapp ?? true,
      planArchive: row.planArchive ?? PLAN_DEFAULT_ARCHIVE[row.plan],
      planCalendar: row.planCalendar ?? PLAN_DEFAULT_CALENDAR[row.plan],
      planAiGenerations:
        row.planAiGenerations ?? PLAN_DEFAULT_AI_GENERATIONS[row.plan],
      maxStudentsOverride: row.maxStudentsOverride,
      maxCoachesOverride: row.maxCoachesOverride,
      whatsappOverride: row.whatsappOverride,
      archiveOverride: row.archiveOverride,
      calendarOverride: row.calendarOverride,
      aiGenerationsOverride: row.aiGenerationsOverride,
    };
    return NextResponse.json({ limits });
  },
);
