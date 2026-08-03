"use client";

import { useRef } from "react";

import { cn } from "@/lib/utils";

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
};

/** Segmented numeric code input with auto-advance, backspace and paste support. */
export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
  autoFocus,
}: OtpInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function setDigit(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join(""));
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) {
      setDigit(index, "");
      return;
    }
    setDigit(index, cleaned[cleaned.length - 1]);
    if (index < length - 1) inputs.current[index + 1]?.focus();
  }

  function handleKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Backspace") {
      if (digits[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        inputs.current[index - 1]?.focus();
        setDigit(index - 1, "");
      }
    } else if (event.key === "ArrowLeft" && index > 0) {
      inputs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    inputs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className="flex justify-between gap-2" onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputs.current[index] = el;
          }}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          aria-label={`Dígito ${index + 1}`}
          className={cn(
            "h-12 w-full rounded-[10px] border-[1.5px] border-input bg-white text-center font-heading text-lg font-bold text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15 disabled:opacity-50",
            digit && "border-primary/50",
          )}
        />
      ))}
    </div>
  );
}
