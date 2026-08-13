import { NextResponse } from "next/server";

import { calendarEventInputSchema, calendarRangeSchema } from "@/lib/calendar";
import { calendarEvents, plans } from "@/server/dal";
import { CalendarValidationError } from "@/server/dal/calendar-events";
import {
  fieldConflict,
  forbidden,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/** 403 shown when the clinic's plan doesn't include the Calendar (Free). */
function calendarLocked() {
  return forbidden(
    "Seu plano não inclui o Calendário. Faça upgrade para usar a agenda.",
  );
}

/**
 * Coach Calendar/Agenda: read a date range, create an event. Coach-only and
 * gated on the plan's `calendar` capability (Free excluded). Tenant-scoped
 * through the DAL; every input validated with zod. The GET merges stored events
 * with the derived check-in markers.
 */
export const GET = withRoute("coach.calendar.list", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();
  if (!(await plans.canUseCalendar(ctx))) return calendarLocked();

  const p = new URL(request.url).searchParams;
  const parsed = calendarRangeSchema.safeParse({
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
  });
  if (!parsed.success) return validationError(parsed.error);

  const calendar = await calendarEvents.getCalendar(ctx, parsed.data);
  return NextResponse.json(calendar);
});

export const POST = withRoute("coach.calendar.create", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();
  if (!(await plans.canUseCalendar(ctx))) return calendarLocked();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = calendarEventInputSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await calendarEvents.createEvent(ctx, parsed.data);
    logger.info("calendar.event_created", { eventId: result.id });
    return NextResponse.json({ event: { id: result.id } }, { status: 201 });
  } catch (error) {
    if (error instanceof CalendarValidationError) {
      return fieldConflict("Aluno inválido.", {
        studentId: "Selecione um aluno da sua clínica.",
      });
    }
    throw error;
  }
});
