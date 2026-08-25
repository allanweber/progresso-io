"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateInput, TimeInput } from "@/components/ui/date-input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  addDays,
  addMonths,
  CALENDAR_EVENT_TYPE_IDS,
  CALENDAR_TYPE_META,
  calendarEventFormSchema,
  dayNumber,
  formatFullDay,
  formatMonthLabel,
  isSameMonth,
  monthGridDays,
  todayYmd,
  weekDays,
  weekdayOf,
  WEEKDAY_SHORT_LABELS,
  type CalendarDto,
  type CalendarItemDto,
} from "@/lib/calendar";
import type { CalendarEventType } from "@/db/schema";
import { fieldError } from "@/lib/form";
import { cn } from "@/lib/utils";

type View = "month" | "week" | "day";

/** Red accent for an overdue check-in, else the category's own colour. */
function itemColors(item: CalendarItemDto): { accent: string; soft: string } {
  if (item.overdue) return { accent: "#DC2626", soft: "#FEE2E2" };
  return CALENDAR_TYPE_META[item.type];
}

/** The time prefix on a chip ("14:00 ") for a timed event, else nothing. */
function timePrefix(item: CalendarItemDto): string {
  return item.startTime ? `${item.startTime} ` : "";
}

/** Groups items by their day, preserving the server's sort within each day. */
function groupByDay(items: CalendarItemDto[]): Map<string, CalendarItemDto[]> {
  const map = new Map<string, CalendarItemDto[]>();
  for (const item of items) {
    const list = map.get(item.date) ?? [];
    list.push(item);
    map.set(item.date, list);
  }
  return map;
}

export default function CoachCalendarPage() {
  const queryClient = useQueryClient();

  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState<string>(() => todayYmd());
  const today = useMemo(() => todayYmd(), []);

  // Dialog state: an item to edit, a preset date (+ optional time) to create on,
  // or closed.
  const [dialog, setDialog] = useState<
    | { mode: "create"; date: string; startTime?: string }
    | { mode: "edit"; item: CalendarItemDto }
    | null
  >(null);

  // The item currently being dragged (for the drag preview).
  const [dragging, setDragging] = useState<CalendarItemDto | null>(null);
  // Mouse: a small move threshold so a click still opens the editor. Touch: a
  // short press-and-hold starts the drag (a plain tap stays a click, and a
  // scroll gesture isn't hijacked) — required for drag-and-drop on mobile.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  // The visible range for the current view.
  const range = useMemo(() => {
    if (view === "month") {
      const grid = monthGridDays(anchor);
      return { from: grid[0], to: grid[grid.length - 1] };
    }
    if (view === "week") {
      const days = weekDays(anchor);
      return { from: days[0], to: days[days.length - 1] };
    }
    return { from: anchor, to: anchor };
  }, [view, anchor]);

  const calendar = useQuery({
    queryKey: ["coach-calendar", range.from, range.to],
    queryFn: () =>
      apiFetch<CalendarDto>(
        `/api/coach/calendar?from=${range.from}&to=${range.to}`,
      ),
  });

  // "Próximos 14 dias" — its own range so it's complete regardless of the grid.
  const upcomingTo = useMemo(() => addDays(today, 13), [today]);
  const upcoming = useQuery({
    queryKey: ["coach-calendar", today, upcomingTo],
    queryFn: () =>
      apiFetch<CalendarDto>(`/api/coach/calendar?from=${today}&to=${upcomingTo}`),
    enabled: view === "month",
  });

  const planLocked = calendar.error instanceof ApiError && calendar.error.status === 403;

  const items = useMemo(() => calendar.data?.items ?? [], [calendar.data]);
  const students = calendar.data?.students ?? [];
  const byDay = useMemo(() => groupByDay(items), [items]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["coach-calendar"] });
    queryClient.invalidateQueries({ queryKey: ["coach-dashboard"] });
  }

  // Reschedule (drag-drop): PATCH a stored event, or CREATE (materialize) a
  // derived check-in marker at the dropped day/time. Same body either way.
  const reschedule = useMutation({
    mutationFn: ({
      item,
      date,
      startTime,
    }: {
      item: CalendarItemDto;
      date: string;
      startTime: string | null;
    }) => {
      const body = {
        type: item.type,
        title: item.title,
        date,
        startTime: startTime ?? "",
        studentId: item.studentId ?? "",
        notes: item.notes ?? "",
      };
      return apiFetch(
        item.id ? `/api/coach/calendar/${item.id}` : "/api/coach/calendar",
        {
          method: item.id ? "PATCH" : "POST",
          body: JSON.stringify(body),
        },
      );
    },
    onSuccess: invalidate,
  });

  function handleDragEnd(e: DragEndEvent) {
    setDragging(null);
    const item = e.active.data.current?.item as CalendarItemDto | undefined;
    const target = e.over?.data.current as
      | { date: string; startTime?: string | null; keepTime?: boolean }
      | undefined;
    if (!item || !target) return;
    const nextStart = target.keepTime
      ? item.startTime
      : (target.startTime ?? null);
    // No-op if it didn't actually move.
    if (item.date === target.date && (item.startTime ?? null) === nextStart) {
      return;
    }
    reschedule.mutate({ item, date: target.date, startTime: nextStart });
  }

  // Clicking an event opens the editor. A derived check-in has no id, so saving
  // it CREATES a record — materializing the marker into a real event. Invoice
  // markers are read-only (managed in billing) — clicking opens the fatura PDF.
  function openItem(item: CalendarItemDto) {
    if (item.source === "invoice-due") {
      const invoiceId = item.key.split(":")[1];
      if (invoiceId) window.open(`/api/coach/invoices/${invoiceId}/pdf`, "_blank");
      return;
    }
    setDialog({ mode: "edit", item });
  }

  const navLabel =
    view === "month"
      ? formatMonthLabel(anchor)
      : view === "week"
        ? weekRangeLabel(anchor)
        : formatFullDay(anchor);

  function go(direction: -1 | 1) {
    if (view === "month") setAnchor((a) => addMonths(a, direction));
    else if (view === "week") setAnchor((a) => addDays(a, direction * 7));
    else setAnchor((a) => addDays(a, direction));
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-[28px]">
            Calendário
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Check-ins, avaliações, renovações
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-border">
            {(["month", "week", "day"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1.5 text-body-dense font-medium transition-colors",
                  view === v
                    ? "bg-primary text-white"
                    : "bg-white text-muted-foreground hover:bg-surface-light",
                )}
              >
                {v === "month" ? "Mês" : v === "week" ? "Semana" : "Dia"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" aria-label="Anterior" onClick={() => go(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[150px] text-center font-heading text-sm font-semibold text-foreground">
            {navLabel}
          </span>
          <Button variant="outline" size="icon" aria-label="Próximo" onClick={() => go(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" onClick={() => setAnchor(todayYmd())}>
            Hoje
          </Button>
          {!planLocked && (
            <Button
              data-testid="calendar-new-event"
              onClick={() => setDialog({ mode: "create", date: anchor })}
            >
              <Plus className="size-4" />
              Evento
            </Button>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(e) =>
          setDragging(
            (e.active.data.current?.item as CalendarItemDto | undefined) ?? null,
          )
        }
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        {planLocked ? (
          <CalendarUpsell />
        ) : calendar.isLoading ? (
          <div className="mt-6 rounded-2xl border border-border bg-white px-4 py-16 text-center text-sm text-muted-foreground">
            Carregando…
          </div>
        ) : calendar.isError ? (
          <div className="mt-6 rounded-2xl border border-border bg-white px-4 py-16 text-center text-sm text-destructive">
            {(calendar.error as Error).message}
          </div>
        ) : view === "month" ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_280px]">
            <MonthGrid
              anchor={anchor}
              today={today}
              byDay={byDay}
              onSelectDay={(date) => setDialog({ mode: "create", date })}
              onOpenItem={openItem}
            />
            <UpcomingPanel
              items={upcoming.data?.items ?? []}
              today={today}
              onOpenItem={openItem}
            />
          </div>
        ) : (
          <TimeGrid
            days={view === "week" ? weekDays(anchor) : [anchor]}
            today={today}
            byDay={byDay}
            onOpenItem={openItem}
            onSelectDay={(date) => setDialog({ mode: "create", date })}
            onSelectSlot={(date, startTime) =>
              setDialog({ mode: "create", date, startTime })
            }
          />
        )}
        <DragOverlay dropAnimation={null}>
          {dragging ? <ChipBody item={dragging} /> : null}
        </DragOverlay>
      </DndContext>

      {!planLocked && <Legend />}

      {dialog && (
        <EventDialog
          key={dialog.mode === "edit" ? dialog.item.key : `new-${dialog.date}`}
          initial={
            dialog.mode === "edit"
              ? dialog.item
              : { date: dialog.date, startTime: dialog.startTime }
          }
          students={students}
          onClose={() => setDialog(null)}
          onSaved={() => {
            invalidate();
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * A drop target: a day cell (month) or a time slot (week/day). Highlights on
 * hover-drag. Clicking the empty space opens the add-event modal (`onEmptyClick`)
 * — chips inside stop propagation so they open the editor instead.
 */
function DroppableCell({
  id,
  data,
  className,
  onEmptyClick,
  children,
}: {
  id: string;
  data: { date: string; startTime?: string | null; keepTime?: boolean };
  className?: string;
  onEmptyClick?: () => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data });
  return (
    <div
      ref={setNodeRef}
      onClick={onEmptyClick}
      className={cn(
        className,
        onEmptyClick && "cursor-pointer",
        isOver && "ring-2 ring-inset ring-primary/50",
      )}
    >
      {children}
    </div>
  );
}

/** "13–19 · Agosto de 2026" — the week nav label. */
function weekRangeLabel(anchor: string): string {
  const days = weekDays(anchor);
  return `${dayNumber(days[0])}–${dayNumber(days[6])} · ${formatMonthLabel(anchor)}`;
}

/* ------------------------------ month grid -------------------------------- */

function MonthGrid({
  anchor,
  today,
  byDay,
  onSelectDay,
  onOpenItem,
}: {
  anchor: string;
  today: string;
  byDay: Map<string, CalendarItemDto[]>;
  onSelectDay: (date: string) => void;
  onOpenItem: (item: CalendarItemDto) => void;
}) {
  const days = monthGridDays(anchor);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_SHORT_LABELS.map((label) => (
          <div
            key={label}
            className="py-2.5 text-center text-caption font-semibold uppercase tracking-wide text-meta"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayItems = byDay.get(day) ?? [];
          const inMonth = isSameMonth(day, anchor);
          const isToday = day === today;
          return (
            <DroppableCell
              key={day}
              id={`day::${day}`}
              data={{ date: day, keepTime: true }}
              onEmptyClick={() => onSelectDay(day)}
              className={cn(
                "group min-h-[92px] border-b border-r border-[#F1F5F9] p-1.5 [&:nth-child(7n)]:border-r-0",
                inMonth ? "bg-white" : "bg-[#FAFBFC]",
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-label",
                    isToday
                      ? "bg-primary font-bold text-white"
                      : inMonth
                        ? "font-medium text-foreground"
                        : "text-[#CBD5E1]",
                  )}
                >
                  {dayNumber(day)}
                </span>
                <span
                  aria-hidden
                  className="text-primary opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Plus className="size-3.5" />
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {dayItems.map((item) => (
                  <EventChip key={item.key} item={item} onClick={() => onOpenItem(item)} />
                ))}
              </div>
            </DroppableCell>
          );
        })}
      </div>
    </div>
  );
}

/** The chip's coloured label — shared by the draggable chip and the drag overlay. */
function ChipBody({ item }: { item: CalendarItemDto }) {
  const { accent, soft } = itemColors(item);
  return (
    <span
      className="block truncate rounded border-l-[3px] px-1.5 py-0.5 text-left text-caption font-semibold leading-tight shadow-sm"
      style={{ background: soft, color: accent, borderColor: accent }}
    >
      {timePrefix(item)}
      {item.title}
      {item.overdue ? " · atrasado" : ""}
    </span>
  );
}

/**
 * A draggable, clickable calendar chip. A small drag threshold (see the
 * PointerSensor) keeps a plain click opening the editor; a real drag reschedules
 * the event (or materializes a derived check-in) at the dropped day/time.
 */
function EventChip({
  item,
  onClick,
}: {
  item: CalendarItemDto;
  onClick: () => void;
}) {
  // Invoices are managed in billing — their markers are read-only (no drag).
  const draggable = item.source !== "invoice-due";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.key,
    data: { item },
    disabled: !draggable,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={(e) => {
        // Don't let the click bubble to the day cell (which opens "new event").
        e.stopPropagation();
        onClick();
      }}
      title={item.title}
      className={cn(
        "text-left",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
      )}
      style={{
        opacity: isDragging ? 0.35 : 1,
        touchAction: draggable ? "none" : undefined,
      }}
      {...listeners}
      {...attributes}
    >
      <ChipBody item={item} />
    </button>
  );
}

/* ------------------------------ time grid --------------------------------- */

const GRID_HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00–22:00

/** The hour bucket (6–22) an item falls in; all-day items return null. */
function hourOf(item: CalendarItemDto): number | null {
  if (!item.startTime) return null;
  const h = Number(item.startTime.slice(0, 2));
  return Math.min(22, Math.max(6, h));
}

function TimeGrid({
  days,
  today,
  byDay,
  onOpenItem,
  onSelectDay,
  onSelectSlot,
}: {
  days: string[];
  today: string;
  byDay: Map<string, CalendarItemDto[]>;
  onOpenItem: (item: CalendarItemDto) => void;
  onSelectDay: (date: string) => void;
  onSelectSlot: (date: string, startTime: string) => void;
}) {
  const cols = days.length;
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
      {/* Day headers */}
      <div
        className="grid border-b border-border"
        style={{ gridTemplateColumns: `56px repeat(${cols}, 1fr)` }}
      >
        <div className="py-2" />
        {days.map((day) => {
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              className="border-l border-border py-2 text-center hover:bg-surface-light"
            >
              <div className="text-caption font-semibold uppercase tracking-wide text-meta">
                {WEEKDAY_SHORT_LABELS[weekdayOf(day)]}
              </div>
              <div
                className={cn(
                  "mx-auto mt-1 flex size-7 items-center justify-center rounded-full text-sm font-semibold",
                  isToday ? "bg-primary text-white" : "text-foreground",
                )}
              >
                {dayNumber(day)}
              </div>
            </button>
          );
        })}
      </div>

      {/* All-day row */}
      <div
        className="grid border-b border-border bg-[#FAFBFC]"
        style={{ gridTemplateColumns: `56px repeat(${cols}, 1fr)` }}
      >
        <div className="py-2 pl-2 text-eyebrow font-medium uppercase text-meta">
          Dia todo
        </div>
        {days.map((day) => {
          const allDay = (byDay.get(day) ?? []).filter((i) => !i.startTime);
          return (
            <DroppableCell
              key={day}
              id={`allday::${day}`}
              data={{ date: day, startTime: null }}
              onEmptyClick={() => onSelectDay(day)}
              className="min-h-[38px] border-l border-border p-1"
            >
              <div className="flex flex-col gap-1">
                {allDay.map((item) => (
                  <EventChip key={item.key} item={item} onClick={() => onOpenItem(item)} />
                ))}
              </div>
            </DroppableCell>
          );
        })}
      </div>

      {/* Hour rows */}
      <div className="max-h-[560px] overflow-y-auto">
        {GRID_HOURS.map((hour) => (
          <div
            key={hour}
            className="grid border-b border-[#F1F5F9]"
            style={{ gridTemplateColumns: `56px repeat(${cols}, 1fr)` }}
          >
            <div className="py-2 pr-2 text-right text-caption text-meta">
              {String(hour).padStart(2, "0")}:00
            </div>
            {days.map((day) => {
              const slot = (byDay.get(day) ?? []).filter(
                (i) => hourOf(i) === hour,
              );
              return (
                <DroppableCell
                  key={day}
                  id={`slot::${day}::${hour}`}
                  data={{ date: day, startTime: `${String(hour).padStart(2, "0")}:00` }}
                  onEmptyClick={() =>
                    onSelectSlot(day, `${String(hour).padStart(2, "0")}:00`)
                  }
                  className="min-h-[44px] border-l border-[#F1F5F9] p-1"
                >
                  <div className="flex flex-col gap-1">
                    {slot.map((item) => (
                      <EventChip
                        key={item.key}
                        item={item}
                        onClick={() => onOpenItem(item)}
                      />
                    ))}
                  </div>
                </DroppableCell>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- upcoming + legend ---------------------------- */

function UpcomingPanel({
  items,
  today,
  onOpenItem,
}: {
  items: CalendarItemDto[];
  today: string;
  onOpenItem: (item: CalendarItemDto) => void;
}) {
  const upcoming = items.filter((i) => i.date >= today).slice(0, 12);
  return (
    <div className="h-fit overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
      <div className="border-b border-border px-4 py-3.5">
        <h2 className="font-heading text-subtitle font-semibold text-foreground">
          Próximos 14 dias
        </h2>
      </div>
      {upcoming.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Nada agendado. 🎉
        </div>
      ) : (
        <ul>
          {upcoming.map((item) => {
            const { accent, soft } = itemColors(item);
            return (
              <li key={item.key} className="border-b border-[#F1F5F9] last:border-0">
                <button
                  type="button"
                  onClick={() => onOpenItem(item)}
                  className="flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-surface-light"
                >
                  <span
                    className="mt-0.5 h-8 w-[3px] shrink-0 rounded"
                    style={{ background: accent }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body-dense font-semibold text-foreground">
                      {item.title}
                    </div>
                    <div className="text-caption text-muted-foreground">
                      {formatFullDay(item.date)}
                      {item.startTime ? ` · ${item.startTime}` : ""}
                    </div>
                    <span
                      className="mt-1 inline-block rounded-full px-2 py-0.5 text-caption font-semibold"
                      style={{ background: soft, color: accent }}
                    >
                      {item.overdue ? "Atrasado" : CALENDAR_TYPE_META[item.type].label}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-4">
      {CALENDAR_EVENT_TYPE_IDS.map((type) => {
        const meta = CALENDAR_TYPE_META[type];
        return (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-[3px] border"
              style={{ background: meta.soft, borderColor: meta.accent }}
            />
            <span className="text-xs text-muted-foreground">{meta.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function CalendarUpsell() {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-white px-6 py-16 text-center shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary-light">
        <CalendarDays className="size-7 text-primary" />
      </div>
      <h2 className="font-heading text-xl font-bold text-foreground">
        O Calendário é um recurso dos planos pagos
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Faça upgrade para o Solo ou Clínica e organize check-ins, avaliações e
        renovações em uma agenda — com os próximos check-ins de cada aluno
        calculados automaticamente.
      </p>
      <div className="mt-6">
        <Button asChild>
          <Link href="/coach/settings">
            <Sparkles className="size-4" />
            Ver planos
          </Link>
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ event dialog ------------------------------ */

const NONE = "__none__";

type EventFormValues = {
  type: CalendarEventType;
  title: string;
  date: string;
  startTime: string;
  studentId: string;
  notes: string;
};

function EventDialog({
  initial,
  students,
  onClose,
  onSaved,
}: {
  initial: CalendarItemDto | { date: string; startTime?: string };
  students: CalendarDto["students"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editingId = "id" in initial ? initial.id : null;

  const defaults: EventFormValues =
    "title" in initial
      ? {
          type: initial.type,
          title: initial.title,
          date: initial.date,
          startTime: initial.startTime ?? "",
          studentId: initial.studentId ?? "",
          notes: initial.notes ?? "",
        }
      : {
          type: "presencial",
          title: "",
          date: initial.date,
          startTime: initial.startTime ?? "",
          studentId: "",
          notes: "",
        };

  const save = useMutation({
    mutationFn: (value: EventFormValues) =>
      apiFetch(
        editingId
          ? `/api/coach/calendar/${editingId}`
          : "/api/coach/calendar",
        { method: editingId ? "PATCH" : "POST", body: JSON.stringify(value) },
      ),
    onSuccess: onSaved,
  });

  const remove = useMutation({
    mutationFn: () =>
      apiFetch(`/api/coach/calendar/${editingId}`, { method: "DELETE" }),
    onSuccess: onSaved,
  });

  const form = useForm({
    defaultValues: defaults,
    validators: { onChange: calendarEventFormSchema },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync(value);
      } catch {
        /* surfaced via save.error */
      }
    },
  });

  const serverErrors =
    save.error instanceof ApiError ? save.error.fieldErrors : undefined;
  const banner =
    save.error instanceof ApiError && !save.error.fieldErrors
      ? save.error.message
      : undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{editingId ? "Editar evento" : "Novo evento"}</DialogTitle>
        </DialogHeader>

        <form
          id="event-form"
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          {banner && (
            <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
              {banner}
            </div>
          )}

          <form.Field name="title">
            {(field) => (
              <Field
                id="title"
                label="Título"
                placeholder="Ex: Avaliação física — João"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                error={fieldError(field, serverErrors?.title)}
              />
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-3">
            <form.Field name="date">
              {(field) => (
                <DateInput
                  id="date"
                  label="Data"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(v) => field.handleChange(v)}
                  error={fieldError(field, serverErrors?.date)}
                />
              )}
            </form.Field>
            <form.Field name="startTime">
              {(field) => (
                <TimeInput
                  id="startTime"
                  label="Horário"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(v) => field.handleChange(v)}
                  error={fieldError(field, serverErrors?.startTime)}
                />
              )}
            </form.Field>
          </div>

          <form.Field name="type">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="type">Tipo</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as CalendarEventType)}
                >
                  <SelectTrigger id="type" onBlur={field.handleBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CALENDAR_EVENT_TYPE_IDS.map((type) => (
                      <SelectItem key={type} value={type}>
                        {CALENDAR_TYPE_META[type].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Field name="studentId">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="studentId">Aluno (opcional)</Label>
                <Select
                  value={field.state.value === "" ? NONE : field.state.value}
                  onValueChange={(v) => field.handleChange(v === NONE ? "" : v)}
                >
                  <SelectTrigger id="studentId" onBlur={field.handleBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhum</SelectItem>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {serverErrors?.studentId && (
                  <p className="text-body-dense text-destructive">
                    {serverErrors.studentId}
                  </p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="notes">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="notes">Anotação (opcional)</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>
        </form>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {editingId ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Removendo…" : "Remover evento"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" form="event-form" disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
