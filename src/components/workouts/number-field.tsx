"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

/**
 * A clamped numeric input that keeps a local **draft string**, so the field can
 * be cleared while typing (an empty box, not one that snaps back to `min`); it
 * commits a clamped number on each valid keystroke and restores a valid value on
 * blur. With `stepper`, a − / + pair adjusts the value by `step`.
 */
export function NumberField({
  value,
  onCommit,
  min,
  max,
  step = 1,
  ariaLabel,
  stepper = false,
  maxDigits = 4,
  inputClassName,
}: {
  value: number;
  onCommit: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  ariaLabel: string;
  stepper?: boolean;
  maxDigits?: number;
  inputClassName: string;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const [draft, setDraft] = useState(() => String(value));

  // Resync from the model only when it genuinely diverges from the draft (a
  // different exercise, a stepper press, add/remove) — never mid-typing, which
  // would clobber an intentionally-empty field.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft((prev) => (prev.replace(/\D/g, "") === String(value) ? prev : String(value)));
  }, [value]);

  const bump = (delta: number) => {
    const base = draft === "" ? value : parseInt(draft, 10);
    const n = clamp((Number.isNaN(base) ? value : base) + delta);
    setDraft(String(n));
    onCommit(n);
  };

  const input = (
    <input
      inputMode="numeric"
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, maxDigits);
        setDraft(digits);
        if (digits !== "") onCommit(clamp(parseInt(digits, 10)));
      }}
      onBlur={() => {
        if (draft === "") {
          setDraft(String(value));
        } else {
          const n = clamp(parseInt(draft, 10));
          setDraft(String(n));
          onCommit(n);
        }
      }}
      className={inputClassName}
    />
  );

  if (!stepper) return input;

  const btn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-input bg-white text-muted-foreground transition-colors hover:border-primary hover:text-primary";
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        aria-label={`Diminuir ${ariaLabel}`}
        onClick={() => bump(-step)}
        className={btn}
      >
        <Minus className="size-4" />
      </button>
      {input}
      <button
        type="button"
        aria-label={`Aumentar ${ariaLabel}`}
        onClick={() => bump(step)}
        className={btn}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
