import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The named rungs of the type ramp (DESIGN.md § Typography, `globals.css`
 * `@theme inline`). They must be declared here or tailwind-merge cannot tell
 * `text-caption` (a size) from `text-danger-fg` (a colour): both look like
 * `text-<word>`, it files the unknown one under `text-color`, and the later
 * class silently deletes the earlier one. That produced a KPI figure rendering
 * at the inherited 16px instead of 30px — with the right class in the source,
 * the right rule in the CSS, and nothing wrong to find in either.
 */
const FONT_SIZE_RUNGS = [
  "eyebrow",
  "caption",
  "label",
  "body-dense",
  "body",
  "subtitle",
  "title",
  "headline",
  "figure",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZE_RUNGS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
