"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

/**
 * The shared look of every numeric box in the builder — the system's 44px
 * control, 1.5px stroke, 10px radius, centered tabular figures. Width and
 * horizontal padding are the caller's, because a séries column and a descanso
 * column want different room; everything else is the same contract and used to
 * be copied by hand in four places, so a change to the focus ring landed in
 * some of them and not others.
 */
export const numberFieldClass =
  "h-11 rounded-[10px] border-[1.5px] border-input bg-card py-2.5 text-center text-body tabular-nums text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15";

/**
 * A clamped numeric input that keeps a local **draft string**, so the field can
 * be cleared while typing (an empty box, not one that snaps back to `min`); it
 * commits a clamped number on each valid keystroke and restores a valid value on
 * blur. With `stepper`, a − / + pair adjusts the value by `step`.
 *
 * It reports itself as a `spinbutton` with a live value range: the box is a
 * numeric control, not free text, and ↑/↓ step it the way one is expected to.
 * Before that the − / + buttons were the only way to step, and a screen reader
 * announced an unbounded textbox that happened to contain digits.
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
  inputClassName?: string;
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
      role="spinbutton"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, maxDigits);
        setDraft(digits);
        if (digits !== "") onCommit(clamp(parseInt(digits, 10)));
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        // The builder's <form> only intercepts Enter, so these are free — and a
        // spinbutton that ignores the arrow keys is one in name only.
        e.preventDefault();
        bump(e.key === "ArrowUp" ? step : -step);
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
      className={inputClassName ?? `${numberFieldClass} w-full px-3.5`}
    />
  );

  if (!stepper) return input;

  const btn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-input bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary";
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
