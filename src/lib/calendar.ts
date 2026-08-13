import type {
  CalendarEventType,
  FeedbackFrequency,
  Weekday,
} from "@/db/schema";
import { z } from "@/lib/validation";

/**
 * Client-safe calendar helpers: event categories + colours, the create/edit zod
 * schema, and pure date math for the Mês/Semana/Dia views and the derived
 * "próximo check-in" markers. Nothing here imports the drizzle schema as a value
 * (only `import type`), so it bundles into client components.
 *
 * Dates are handled as plain `YYYY-MM-DD` calendar strings and, where a clock is
 * needed ("today", "overdue"), against a FIXED `America/Sao_Paulo` zone — the
 * product is BR-only, so this is deterministic regardless of the server TZ. The
 * string math anchors each day at noon-UTC so day arithmetic never trips over a
 * DST/offset boundary (São Paulo has had no DST since 2019, but noon is safe
 * regardless).
 */

/* --------------------------------- types ---------------------------------- */

/**
 * The self-selectable event categories, in display order. A client-safe copy of
 * the schema's `CALENDAR_EVENT_TYPES` (kept here so this lib never pulls the
 * drizzle schema into the browser); `satisfies` keeps the two from drifting.
 */
export const CALENDAR_EVENT_TYPE_IDS = [
  "checkin",
  "presencial",
  "admin",
] as const satisfies readonly CalendarEventType[];

/** Colour tokens per category — the green/purple/amber of the mock's legend. */
export type CalendarTypeMeta = {
  id: CalendarEventType;
  label: string;
  /** Solid accent (dot, left border, overdue text). */
  accent: string;
  /** Soft chip/cell background. */
  soft: string;
};

export const CALENDAR_TYPE_META: Record<CalendarEventType, CalendarTypeMeta> = {
  checkin: { id: "checkin", label: "Check-in", accent: "#059669", soft: "#DCFCE7" },
  presencial: {
    id: "presencial",
    label: "Presencial",
    accent: "#7C3AED",
    soft: "#EDE9FE",
  },
  admin: {
    id: "admin",
    label: "Administrativo",
    accent: "#B45309",
    soft: "#FEF3C7",
  },
};

/** Human label for a category (PT-BR). */
export function calendarTypeLabel(type: CalendarEventType): string {
  return CALENDAR_TYPE_META[type].label;
}

/**
 * A single item rendered on the calendar — either a stored manual event or a
 * derived, read-only "check-in due" marker. Derived markers have `id: null`
 * (nothing to edit/delete); the client keys off `key` in either case.
 */
export type CalendarItemDto = {
  /** Stable client key. Manual → the row id; derived → `checkin:<studentId>`. */
  key: string;
  /** The row id for stored events; `null` for derived markers (read-only). */
  id: string | null;
  source: "manual" | "checkin-due" | "invoice-due";
  type: CalendarEventType;
  title: string;
  /** Clinic-local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Wall-clock `HH:MM`, or `null` for an all-day item. */
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  studentId: string | null;
  studentName: string | null;
  /** Derived check-in markers set this for a red "atrasado" accent. */
  overdue: boolean;
};

/** A pickable student for the event form's optional "aluno" link. */
export type CalendarStudentOption = {
  id: string;
  firstName: string;
  lastName: string;
};

/** The calendar payload for a date range: merged items + student options. */
export type CalendarDto = {
  from: string;
  to: string;
  items: CalendarItemDto[];
  students: CalendarStudentOption[];
};

/* ------------------------------- validation ------------------------------- */

const ymdString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

/** `HH:MM` or empty → null (an all-day item). */
const optionalTime = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.")
    .nullable(),
);

const optionalUuid = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.string().uuid("Aluno inválido.").nullable(),
);

const optionalNotes = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.string().max(500, "Anotação muito longa.").nullish(),
);

/**
 * The create/edit body for a manual calendar event. The client sends JSON; the
 * route handler parses this before the DAL writes it. `clinicId`/`coachId`/
 * `createdBy` are stamped from the session, never trusted from the body.
 */
export const calendarEventInputSchema = z.object({
  type: z.enum(CALENDAR_EVENT_TYPE_IDS),
  title: z
    .string()
    .trim()
    .min(1, "Informe um título.")
    .max(120, "Título muito longo."),
  date: ymdString,
  startTime: optionalTime,
  endTime: optionalTime,
  studentId: optionalUuid,
  notes: optionalNotes,
});

export type CalendarEventInput = z.infer<typeof calendarEventInputSchema>;

/**
 * The client form's shape — plain strings (empty = "unset"), for TanStack Form's
 * on-change validation. The server re-parses the submitted JSON with
 * {@link calendarEventInputSchema}, which coerces the empties to null; keeping
 * the two separate avoids the `preprocess` input (`unknown`) clashing with the
 * form's string fields.
 */
export const calendarEventFormSchema = z.object({
  type: z.enum(CALENDAR_EVENT_TYPE_IDS),
  title: z
    .string()
    .trim()
    .min(1, "Informe um título.")
    .max(120, "Título muito longo."),
  date: ymdString,
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.")
    .or(z.literal("")),
  studentId: z.string(),
  notes: z.string().max(500, "Anotação muito longa."),
});

/** The `?from=&to=` range a calendar read is scoped to. */
export const calendarRangeSchema = z
  .object({ from: ymdString, to: ymdString })
  .refine((r) => r.from <= r.to, {
    message: "Intervalo inválido.",
    path: ["to"],
  });

/* ------------------------------- date math -------------------------------- */

const SAO_PAULO_TZ = "America/Sao_Paulo";

const spDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SAO_PAULO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's clinic-local (`America/Sao_Paulo`) calendar day, `YYYY-MM-DD`. */
export function todayYmd(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we store.
  return spDayFormatter.format(now);
}

/** A `YYYY-MM-DD` anchored at noon UTC — safe for day arithmetic. */
function ymdToNoonUtc(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

function noonUtcToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Adds (or subtracts) whole days to a `YYYY-MM-DD`, returning a `YYYY-MM-DD`. */
export function addDays(ymd: string, days: number): string {
  const d = ymdToNoonUtc(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return noonUtcToYmd(d);
}

/** Weekday of a `YYYY-MM-DD`: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(ymd: string): number {
  return ymdToNoonUtc(ymd).getUTCDay();
}

/** Schema `Weekday` name → JS weekday index (Sunday = 0). */
export const WEEKDAY_INDEX: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** The first `YYYY-MM-DD` on/after `ymd` that falls on `weekdayIndex`. */
export function snapToWeekday(ymd: string, weekdayIndex: number): string {
  const diff = (weekdayIndex - weekdayOf(ymd) + 7) % 7;
  return addDays(ymd, diff);
}

/** Cadence interval in days, weekday-aligned (4 weeks for "mensal"). */
export const FREQUENCY_DAYS: Record<FeedbackFrequency, number> = {
  semanal: 7,
  quinzenal: 14,
  mensal: 28,
};

export type CheckinDueInput = {
  /** Today, clinic-local `YYYY-MM-DD`. */
  today: string;
  /** The student's most recent check-in date, or null when none yet. */
  lastCheckinDate: string | null;
  /** Fallback base when there's no history (the student's join day). */
  createdDate: string;
  frequency: FeedbackFrequency;
};

export type CheckinDue = { date: string; overdue: boolean };

/**
 * The next check-in due date for one student: their last check-in (or, with no
 * history, their join day) plus the clinic's cadence **interval**. The interval
 * is always a whole number of weeks (7 / 14 / 28), so the result keeps the SAME
 * WEEKDAY the student was registered / last checked in on — the day is the
 * student's own, only the interval comes from the clinic preference. If the
 * projected date is already past (the student is overdue), it rolls forward by
 * whole intervals — staying on that weekday — to the next future occurrence and
 * is flagged red.
 */
export function computeCheckinDue(input: CheckinDueInput): CheckinDue {
  const step = FREQUENCY_DAYS[input.frequency];
  const base = input.lastCheckinDate ?? input.createdDate;
  let due = addDays(base, step);
  if (due >= input.today) return { date: due, overdue: false };
  // Overdue: advance by whole intervals (preserving the weekday) into the future.
  while (due < input.today) due = addDays(due, step);
  return { date: due, overdue: true };
}

/* ----------------------------- view helpers ------------------------------- */

/** The 1st of `ymd`'s month, `YYYY-MM-01`. */
export function startOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

/** Shifts to the 1st of another month, `n` months away. */
export function addMonths(ymd: string, n: number): string {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7)) - 1 + n;
  const y = year + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * The 42 days (6 weeks, Sunday-first) of the month grid containing `ymd` — the
 * leading/trailing days spill into the adjacent months, as a month calendar does.
 */
export function monthGridDays(ymd: string): string[] {
  const first = startOfMonth(ymd);
  const gridStart = addDays(first, -weekdayOf(first));
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

/** The 7 days (Sunday-first) of the week containing `ymd`. */
export function weekDays(ymd: string): string[] {
  const start = addDays(ymd, -weekdayOf(ymd));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Whether `ymd` is in `ymd`'s own month vs. spilled from an adjacent one. */
export function isSameMonth(ymd: string, anchor: string): boolean {
  return ymd.slice(0, 7) === anchor.slice(0, 7);
}

/** Short weekday headers, Sunday-first (index matches `weekdayOf`). */
export const WEEKDAY_SHORT_LABELS = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
] as const;

const monthYearFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const dayMonthFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const weekdayLongFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  timeZone: "UTC",
});

/** "agosto de 2026" — the month/year nav label (capitalised). */
export function formatMonthLabel(ymd: string): string {
  const s = monthYearFormatter.format(ymdToNoonUtc(ymd));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Sábado · 13 de agosto" — a full day label (capitalised weekday). */
export function formatFullDay(ymd: string): string {
  const weekday = weekdayLongFormatter.format(ymdToNoonUtc(ymd));
  const dayMonth = dayMonthFormatter.format(ymdToNoonUtc(ymd));
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${dayMonth}`;
}

/** The day-of-month number, for a grid cell. */
export function dayNumber(ymd: string): number {
  return Number(ymd.slice(8, 10));
}
