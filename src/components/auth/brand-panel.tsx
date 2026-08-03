import Link from "next/link";

import { Logo } from "@/components/brand/logo";

/** Green testimonial panel shown on the left of the login screen. */
export function BrandPanel() {
  return (
    <div className="relative flex w-full shrink-0 flex-col justify-between overflow-hidden bg-primary p-8 max-md:min-h-[220px] max-md:flex-row max-md:items-center max-md:justify-between md:w-[420px] md:p-11">
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -right-20 -top-20 size-[300px] rounded-full bg-white/[0.06]" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 size-[240px] rounded-full bg-white/[0.06]" />

      <div className="relative">
        <Link href="/">
          <Logo size={36} inverted className="text-lg tracking-[0.02em]" />
        </Link>
      </div>

      <div className="relative max-md:hidden">
        <p className="mb-5 font-heading text-[28px] font-bold leading-[1.25] tracking-[-0.02em] text-white">
          &ldquo;Automatize o que cansa. Foque no que importa.&rdquo;
        </p>
        <div className="flex items-center gap-3">
          <span className="flex size-[38px] items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
            TC
          </span>
          <div>
            <div className="text-sm font-semibold text-white">Thiago Corrêa</div>
            <div className="text-xs text-white/65">Coach Personal · 47 alunos</div>
          </div>
        </div>
      </div>

      <div className="relative flex gap-7 max-md:hidden">
        <div>
          <div className="font-heading text-[26px] font-bold text-white">2h/dia</div>
          <div className="text-xs text-white/65">economizadas no WA</div>
        </div>
        <div>
          <div className="font-heading text-[26px] font-bold text-white">+38%</div>
          <div className="text-xs text-white/65">adesão dos alunos</div>
        </div>
      </div>
    </div>
  );
}
