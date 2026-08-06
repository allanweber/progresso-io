import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-primary-light-border bg-primary-light text-primary px-3.5 py-1 text-[13px]",
        solid:
          "border-transparent bg-primary text-primary-foreground px-3 py-1 text-xs",
        soft: "border-transparent bg-[#dcfce7] text-primary px-2.5 py-0.5 text-[10px] uppercase tracking-[0.08em]",
        // Small catalog chips (origin / type / count).
        base: "border-transparent bg-[#EEF2FF] text-[#4338CA] px-2 py-0.5 text-xs",
        clinic: "border-transparent bg-[#ECFDF5] text-[#047857] px-2 py-0.5 text-xs",
        neutral: "border-transparent bg-[#F1F5F9] text-[#475569] px-2 py-0.5 text-xs",
        warn: "border-transparent bg-[#FEF3C7] text-[#92400E] px-2 py-0.5 text-xs",
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
