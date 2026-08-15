"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Date + time fields backed by the **native** `<input type="date">` /
 * `type="time"`, so the device shows its calendar and time picker (a tap on
 * mobile, no typing). Their value format is exactly the canonical
 * `yyyy-mm-dd` / 24h `HH:MM` the rest of the app stores, so `value`/`onChange`
 * pass through unchanged. The picker + the field's display follow the device
 * locale (a Brazilian device shows dd/mm/aaaa); the stored value is always
 * canonical regardless. Use them in place of raw date/time inputs.
 */

type DateInputProps = {
  id: string;
  label: string;
  /** Canonical value, `yyyy-mm-dd` or "". */
  value: string;
  /** Emits `yyyy-mm-dd` (or "" when cleared). */
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
};

/** Label + native date picker, storing `yyyy-mm-dd`. */
export function DateInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
}: DateInputProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="[color-scheme:light]"
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
        <p id={`${id}-error`} className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
