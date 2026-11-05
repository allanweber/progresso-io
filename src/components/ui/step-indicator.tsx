"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The numbered step rail both wizards wear: sign-up (`register-wizard`) and the
 * setup guide (`/onboarding`). Steps behind the current one collapse to a tick,
 * the current and past ones read in the brand colour, the rest stay muted.
 *
 * `current` is 1-based, so `current === labels.length` is the last step.
 *
 * The connector between two steps is offset to the circle centre rather than centred: it aligns
 * with the circles, not with the circle-plus-label block, so the labels can
 * differ in height without bending the rail.
 */
export function StepIndicator({
  labels,
  current,
  className,
}: {
  labels: readonly string[];
  current: number;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full items-start sm:w-auto", className)}>
      {labels.map((label, i) => {
        const index = i + 1;
        const done = current > index;
        const active = current >= index;
        return (
          <div key={label} className="flex items-start max-sm:flex-1 max-sm:last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-bold",
                  active
                    ? "bg-primary text-white"
                    : "border-2 border-border bg-white text-meta",
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : index}
              </span>
              <span
                className={cn(
                  "text-eyebrow font-semibold",
                  current !== index && "max-sm:sr-only",
                  active ? "text-primary" : "text-meta",
                )}
              >
                {label}
              </span>
            </div>
            {index < labels.length && (
              <span
                className={cn(
                  "mt-[13px] h-0.5 w-12 max-sm:w-auto max-sm:min-w-2 max-sm:flex-1",
                  current > index ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
