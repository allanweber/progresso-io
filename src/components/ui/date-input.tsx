"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  addDays,
  addMonths,
  dayNumber,
  formatMonthLabel,
  isSameMonth,
  monthGridDays,
  startOfMonth,
  todayYmd,
  WEEKDAY_SHORT_LABELS,
} from "@/lib/calendar";
import {
  BR_DATE_PLACEHOLDER,
  brToIso,
  isoToBr,
  maskBrDate,
} from "@/lib/date-br";
import { cn } from "@/lib/utils";

/**
 * The date + time fields used across the app. Both store the canonical value the
 * rest of the app uses — `yyyy-mm-dd` / 24h `HH:MM` — so `value`/`onChange`
 * speak ISO regardless of what the user sees.
 *
 * The DATE field is a **masked `dd/mm/aaaa` text input with a calendar picker on
 * the icon**, not the native `<input type="date">` it used to be. The native
 * control renders in the *device* locale, so the same field read `dd/mm/aaaa` on
 * a Brazilian phone and `mm/dd/yyyy` on a machine set to en-US — with no way to
 * tell 03/04 apart. Typing is the fast path (eight digits, numeric keypad, no
 * slashes to type); the icon opens a month grid for the times a date is easier
 * pointed at than recalled. Both write the same canonical value.
 *
 * The TIME field keeps the native picker: `HH:MM` is unambiguous everywhere.
 *
 * The grid reuses the month math the coach agenda already runs on
 * (`monthGridDays`, `WEEKDAY_SHORT_LABELS`), so a day cell means the same thing
 * in both places, and "hoje" is São Paulo's day rather than the device's.
 */

type DateInputProps = {
  id: string;
  label: string;
  /** Canonical value, `yyyy-mm-dd` or "". */
  value: string;
  /** Emits `yyyy-mm-dd`, or "" while the typed date is incomplete/invalid. */
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  /** Earliest accepted date (canonical), inclusive. */
  min?: string;
  /** Latest accepted date (canonical), inclusive. */
  max?: string;
};

/**
 * Label + masked `dd/mm/aaaa` field, storing `yyyy-mm-dd`.
 *
 * `min`/`max` are checked here (there is no native control to grey out days) and
 * reported as a local message — but only when the caller passes no `error` of
 * its own, so a form's zod message always wins. They are a courtesy, never the
 * rule: the server validates the range regardless.
 */
export function DateInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  min,
  max,
}: DateInputProps) {
  const [text, setText] = useState(() => isoToBr(value));
  // Re-sync when the canonical value changes from the outside (a form reset, a
  // record loading in). Adjusting state during render — no effect needed.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(isoToBr(value));
  }

  const typed = brToIso(text);
  let localError: string | undefined;
  if (text.length === BR_DATE_PLACEHOLDER.length && typed === null) {
    localError = "Data inválida.";
  } else if (typed && min && typed < min) {
    localError = `Escolha uma data a partir de ${isoToBr(min)}.`;
  } else if (typed && max && typed > max) {
    localError = `Escolha uma data até ${isoToBr(max)}.`;
  }

  const shown = error ?? localError;

  // The month the grid is showing. Re-anchored every time the popover opens, so
  // it always lands on the selected date rather than wherever it was left.
  const today = todayYmd();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(() =>
    startOfMonth(typed ?? clamp(today, min, max)),
  );

  function pick(day: string) {
    setText(isoToBr(day));
    setLastValue(day);
    onChange(day);
    setOpen(false);
  }

  // A month is unreachable when every one of its days falls outside [min, max].
  const prevMonth = addMonths(anchor, -1);
  const nextMonth = addMonths(anchor, 1);
  const prevDisabled = Boolean(min && lastDayOfMonth(prevMonth) < min);
  const nextDisabled = Boolean(max && nextMonth > max);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={BR_DATE_PLACEHOLDER}
          className="pr-11"
          value={text}
          onChange={(e) => {
            const masked = maskBrDate(e.target.value);
            setText(masked);
            const iso = brToIso(masked) ?? "";
            setLastValue(iso);
            onChange(iso);
          }}
          onBlur={onBlur}
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? `${id}-error` : undefined}
        />
        <Popover
          open={open}
          onOpenChange={(o) => {
            if (o) setAnchor(startOfMonth(typed ?? clamp(today, min, max)));
            setOpen(o);
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${label}: escolher no calendário`}
              className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
            >
              <CalendarDays className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[17.5rem]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Mês anterior"
                disabled={prevDisabled}
                onClick={() => setAnchor(prevMonth)}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span
                aria-live="polite"
                className="text-body-dense font-semibold text-foreground"
              >
                {formatMonthLabel(anchor)}
              </span>
              <button
                type="button"
                aria-label="Próximo mês"
                disabled={nextDisabled}
                onClick={() => setAnchor(nextMonth)}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5" role="grid">
              {WEEKDAY_SHORT_LABELS.map((w) => (
                <div
                  key={w}
                  className="pb-1 text-center text-caption font-semibold text-muted-foreground"
                >
                  {w.slice(0, 1)}
                </div>
              ))}
              {monthGridDays(anchor).map((day) => {
                const outside = !isSameMonth(day, anchor);
                const disabled =
                  Boolean(min && day < min) || Boolean(max && day > max);
                const selected = typed === day;
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={disabled}
                    aria-current={selected ? "date" : undefined}
                    aria-label={isoToBr(day)}
                    onClick={() => pick(day)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg text-body-dense tabular-nums transition-colors",
                      "hover:bg-muted disabled:pointer-events-none disabled:opacity-25",
                      outside && "text-muted-foreground/60",
                      !outside && "text-foreground",
                      day === today &&
                        !selected &&
                        "ring-1 ring-inset ring-primary/40",
                      selected &&
                        "bg-primary font-semibold text-white hover:bg-primary",
                    )}
                  >
                    {dayNumber(day)}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {shown && (
        <p id={`${id}-error`} className="text-body-dense text-destructive">
          {shown}
        </p>
      )}
    </div>
  );
}

/** `ymd` pulled inside [min, max] — where the grid opens with nothing selected. */
function clamp(ymd: string, min?: string, max?: string): string {
  if (min && ymd < min) return min;
  if (max && ymd > max) return max;
  return ymd;
}

/** The last day of `ymd`'s month, for deciding a month is entirely out of range. */
function lastDayOfMonth(ymd: string): string {
  const next = addMonths(startOfMonth(ymd), 1);
  return addDays(next, -1);
}

type TimeInputProps = {
  id: string;
  label: string;
  /** Canonical value, 24h `HH:MM` or "". */
  value: string;
  /** Emits 24h `HH:MM` (or "" when cleared). */
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
};

/** Label + native time picker, storing 24h `HH:MM`. */
export function TimeInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
}: TimeInputProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="[color-scheme:light]"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="text-body-dense text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
