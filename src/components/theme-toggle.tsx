"use client";

import { useSyncExternalStore } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  readThemePreference,
  setThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Automático", icon: Monitor },
];

function useThemePreference() {
  return useSyncExternalStore(
    subscribeThemePreference,
    readThemePreference,
    () => "system" as const,
  );
}

function ThemeOptions({ preference }: { preference: ThemePreference }) {
  return (
    <div role="radiogroup" aria-label="Tema" className="flex flex-col">
      {OPTIONS.map(({ value, label, icon: OptionIcon }) => {
        const selected = value === preference;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setThemePreference(value)}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-left text-body transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "font-medium text-foreground" : "text-text-secondary",
            )}
          >
            <OptionIcon className="size-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {selected ? <Check className="size-4 text-primary-deep" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function ThemeToggle({
  className,
  variant = "menu",
}: {
  className?: string;
  variant?: "menu" | "inline";
}) {
  const preference = useThemePreference();
  const current = OPTIONS.find((o) => o.value === preference) ?? OPTIONS[2];
  const Icon = current.icon;

  if (variant === "inline") {
    return (
      <div className={className}>
        <p className="mb-1.5 px-3 text-caption font-medium text-meta">Tema</p>
        <ThemeOptions preference={preference} />
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Tema: ${current.label}`}
        data-testid="theme-toggle"
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-md border-[1.5px] border-input text-text-secondary transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none sm:size-9",
          className,
        )}
      >
        <Icon className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        <p className="px-2.5 pb-1 pt-1.5 text-caption font-medium text-meta">
          Tema
        </p>
        <ThemeOptions preference={preference} />
      </PopoverContent>
    </Popover>
  );
}
