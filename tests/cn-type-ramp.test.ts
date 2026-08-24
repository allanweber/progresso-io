import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

/**
 * `cn()` runs tailwind-merge, which decides what conflicts by *parsing* class
 * names. Every rung of this project's type ramp is `text-<word>` — and so is
 * every text colour. Unless the rungs are declared as font sizes (see
 * `src/lib/utils.ts`), tailwind-merge files them under `text-color` and a colour
 * later in the same `cn()` call silently deletes the size.
 *
 * That is invisible in review: the source has the right class, `globals.css` has
 * the right rule, and the element still renders — just at the inherited 16px.
 * It bit twelve call sites across the app before it was caught by a KPI figure
 * that should have been 30px. These tests are the tripwire for the next rung
 * added to the ramp without being registered here.
 */
const RUNGS = [
  "text-eyebrow",
  "text-caption",
  "text-label",
  "text-body-dense",
  "text-body",
  "text-subtitle",
  "text-title",
  "text-headline",
  "text-figure",
] as const;

describe("cn() and the named type ramp", () => {
  it.each(RUNGS)("keeps %s when a text colour follows it", (rung) => {
    const out = cn(rung, "text-foreground");
    expect(out).toContain(rung);
    expect(out).toContain("text-foreground");
  });

  it.each(RUNGS)("keeps %s when a conditional colour follows it", (rung) => {
    const out = cn("font-bold", rung, true && "text-danger-fg");
    expect(out).toContain(rung);
  });

  it("still collapses two sizes to the last one", () => {
    expect(cn("text-caption", "text-headline")).toBe("text-headline");
  });

  it("still collapses two colours to the last one", () => {
    expect(cn("text-foreground", "text-danger-fg")).toBe("text-danger-fg");
  });

  it("keeps a size and a colour together in either order", () => {
    expect(cn("text-muted-foreground", "text-caption")).toBe(
      "text-muted-foreground text-caption",
    );
  });
});
