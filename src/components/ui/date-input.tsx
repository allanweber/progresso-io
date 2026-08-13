"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Locale-proof date + time fields. The native `<input type="date">` /
 * `type="time"` render in the *browser's* locale (so a US device shows
 * `mm/dd/yyyy` + `9:30 AM`), which we can't override. These masked text inputs
 * always display **dd/mm/aaaa** and **24h HH:MM** regardless of device locale,
 * while still storing the canonical `yyyy-mm-dd` / `HH:MM` the rest of the app
 * expects. Use them everywhere in place of native date/time inputs.
 */

/* --------------------------------- date ----------------------------------- */

/** `yyyy-mm-dd` → `dd/mm/aaaa` for display (empty when not a full ISO date). */
function isoToBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Progressive `dd/mm/aaaa` mask from raw keystrokes. */
function maskDate(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 8);
  const parts = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean);
  return parts.join("/");
}

/** `dd/mm/aaaa` (any partial) → `yyyy-mm-dd`, or "" when incomplete/invalid. */
function brToIso(display: string): string {
  const d = display.replace(/\D/g, "");
  if (d.length !== 8) return "";
  const dd = d.slice(0, 2);
  const mm = d.slice(2, 4);
  const yyyy = d.slice(4, 8);
  const iso = `${yyyy}-${mm}-${dd}`;
  // Reject impossible dates (e.g. 31/02) by round-tripping through UTC noon.
  const dt = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) {
    return "";
  }
  return iso;
}

type DateInputProps = {
  id: string;
  label: string;
  /** Canonical value, `yyyy-mm-dd` or "". */
  value: string;
  /** Emits `yyyy-mm-dd` when a full valid date is typed, else "". */
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
};

/** Label + masked dd/mm/aaaa input, storing `yyyy-mm-dd`. */
export function DateInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
}: DateInputProps) {
  const [display, setDisplay] = useState(() => isoToBr(value));

  // Re-sync the display when the stored value changes from the outside (e.g.
  // form reset / editing a different event), but never clobber in-progress typing.
  useEffect(() => {
    if (brToIso(display) === value) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplay(isoToBr(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        autoComplete="off"
        value={display}
        onChange={(e) => {
          const masked = maskDate(e.target.value);
          setDisplay(masked);
          onChange(brToIso(masked));
        }}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/* --------------------------------- time ----------------------------------- */

/** Progressive 24h `HH:MM` mask from raw keystrokes. */
function maskTime(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

type TimeInputProps = {
  id: string;
  label: string;
  /** Canonical value, 24h `HH:MM` or "". */
  value: string;
  /** Emits the masked `HH:MM` (form validation enforces the exact shape). */
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
};

/** Label + masked 24h HH:MM input. */
export function TimeInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
}: TimeInputProps) {
  const [display, setDisplay] = useState(() => value);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplay(value);
  }, [value]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        placeholder="hh:mm"
        autoComplete="off"
        value={display}
        onChange={(e) => {
          const masked = maskTime(e.target.value);
          setDisplay(masked);
          onChange(masked);
        }}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
