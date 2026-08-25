"use client";

import { HexColorInput, HexColorPicker } from "react-colorful";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * An accessible in-app color picker (shadcn-style: a Popover holding a
 * react-colorful spectrum + a hex field + preset quick-picks), so we never fall
 * back to the browser's raw OS color dialog. The value is a `#rrggbb` hex, or an
 * empty string meaning "no custom color — use the default".
 */
export function ColorPicker({
  id,
  value,
  onChange,
  presets = [],
  defaultColor = "#16a34a",
  emptyLabel = "Cor padrão",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  presets?: readonly string[];
  defaultColor?: string;
  emptyLabel?: string;
}) {
  const hasCustom = value.trim() !== "";
  const current = hasCustom ? value : defaultColor;
  const selected = value.toLowerCase();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className="inline-flex h-11 items-center gap-2.5 rounded-[10px] border-[1.5px] border-input bg-white px-3 text-body transition-colors sm:h-10 hover:border-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
        >
          <span
            className="size-5 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: current }}
          />
          <span className={cn("font-mono", !hasCustom && "text-muted-foreground")}>
            {hasCustom ? value.toUpperCase() : emptyLabel}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-3">
        <HexColorPicker
          color={current}
          onChange={onChange}
          style={{ width: "100%" }}
        />

        <div className="flex items-center gap-1.5 rounded-md border-[1.5px] border-input px-2.5">
          <span className="text-sm text-muted-foreground">#</span>
          <HexColorInput
            color={current}
            onChange={onChange}
            className="h-9 w-full bg-transparent font-mono text-sm uppercase transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
            aria-label="Código hexadecimal da cor"
          />
        </div>

        {presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Cor ${color}`}
                aria-pressed={selected === color}
                onClick={() => onChange(color)}
                style={{ backgroundColor: color }}
                className={cn(
                  "size-6 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  selected === color
                    ? "ring-2 ring-offset-1 ring-foreground ring-offset-background"
                    : "ring-1 ring-black/10",
                )}
              />
            ))}
          </div>
        )}

        {hasCustom && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => onChange("")}
          >
            Usar cor padrão
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
