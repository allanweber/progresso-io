import { NextResponse } from "next/server";

import { calendarEventInputSchema } from "@/lib/calendar";
import { calendarEvents, plans } from "@/server/dal";
import { CalendarValidationError } from "@/server/dal/calendar-events";
import {
  fieldConflict,
  forbidden,
  isUuid,
  notFound,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

function calendarLocked() {
  return forbidden(
    "Seu plano não inclui o Calendário. Faça upgrade para usar a agenda.",
  );
}

type Params = { params: Promise<{ id: string }> };

/**
 * Edit / delete a single manual calendar event. Coach-only, plan-gated, and
 * tenant-scoped through the DAL (only this clinic's events are reachable — the
 * DAL's WHERE includes `clinicId`). Derived check-in markers have no id and
 * never reach this route.
 */
export const PATCH = withRoute<Params>(
  "coach.calendar.update",
  async (request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();
    if (!(await plans.canUseCalendar(ctx))) return calendarLocked();

    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = calendarEventInputSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    try {
      const updated = await calendarEvents.updateEvent(ctx, id, parsed.data);
      if (!updated) return notFound("Evento não encontrado.");
      logger.info("calendar.event_updated", { eventId: id });
      return NextResponse.json({ event: { id: updated.id } });
    } catch (error) {
      if (error instanceof CalendarValidationError) {
        return fieldConflict("Aluno inválido.", {
          studentId: "Selecione um aluno da sua clínica.",
        });
      }
      throw error;
    }
  },
);

export const DELETE = withRoute<Params>(
  "coach.calendar.delete",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();
    if (!(await plans.canUseCalendar(ctx))) return calendarLocked();

    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const removed = await calendarEvents.deleteEvent(ctx, id);
    if (!removed) return notFound("Evento não encontrado.");
    logger.info("calendar.event_deleted", { eventId: id });
    return NextResponse.json({ ok: true });
  },
);
