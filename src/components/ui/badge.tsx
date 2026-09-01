import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The chip vocabulary. One shape — a fully rounded pill at `px-2.5 py-0.5`,
 * 12px semibold, no border — and one construction: a pale wash carrying a
 * darkened ink of the same hue. Every pair is verified at >=5:1 because chip
 * text ships at 11-12px, where the pure pigment on its own wash lands near 3:1
 * and fails the small-text floor.
 *
 * The border is gone on purpose. A wash plus a mid-tone edge plus dark ink is
 * three signals for one fact; the wash alone reads faster in a fifty-row table
 * and stops a column of chips from looking like a column of buttons.
 *
 * Hues are semantic, not decorative:
 *   default  emerald — this thing is ALIVE (ativo, publicado, em dia)
 *   ok       green   — a finished good outcome (concluído, entregue)
 *   info     blue    — in flight, nothing wrong (processando, enviado)
 *   warn     amber   — needs attention soon (vence em, pendente)
 *   danger   red     — wrong now (vencida, atrasado, sem treino)
 *   neutral  greige  — a fact with no state (a count, a type, arquivado)
 *   base     indigo  — platform catalog data, not the clinic's own
 *   clinic   emerald — the clinic's own catalog row
 *   solid    emerald — an emphatic count on a pale ground
 *   soft     emerald — the 10px uppercase eyebrow marker
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border-0 px-2.5 py-0.5 text-label font-semibold transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "bg-primary-light text-primary-deep",
        ok: "bg-ok-bg text-ok-fg",
        info: "bg-info-bg text-info-fg",
        warn: "bg-warn-bg text-warn-fg",
        danger: "bg-danger-bg text-danger-fg",
        neutral: "bg-neutral-bg text-neutral-fg",
        base: "bg-base-bg text-base-fg",
        clinic: "bg-primary-light text-primary-deep",
        // Deep Emerald, not Vital: white on #059669 is 3.77:1 and this ships at
        // 12px. See DESIGN.md § The 18px Rule.
        solid: "bg-primary-deep text-primary-foreground",
        soft: "bg-primary-light px-2 text-eyebrow uppercase tracking-[0.08em] text-primary-deep",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
