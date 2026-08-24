import Link from "next/link";
import {
  Dumbbell,
  MessageCircle,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";

type Highlight = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const highlights: Highlight[] = [
  {
    icon: MessageCircle,
    title: "WhatsApp integrado",
    description: "Check-ins, lembretes e cobranças automáticas.",
  },
  {
    icon: Users,
    title: "Gestão de alunos",
    description: "Ficha, histórico e progresso num só lugar.",
  },
  {
    icon: Dumbbell,
    title: "Treinos e dietas",
    description: "Com substituições que o aluno consulta sozinho.",
  },
  {
    icon: TrendingUp,
    title: "Evolução real",
    description: "Gráficos de peso, medidas e adesão.",
  },
];

/**
 * Green side panel shown on the login and registration screens.
 * Highlights core product features (no testimonials).
 */
export function BrandPanel() {
  return (
    <div className="relative flex w-full shrink-0 flex-col justify-between overflow-hidden bg-primary p-8 max-md:min-h-[200px] max-md:flex-row max-md:items-center max-md:justify-between md:w-[420px] md:p-11">
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -right-20 -top-20 size-[300px] rounded-full bg-white/[0.06]" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 size-[240px] rounded-full bg-white/[0.06]" />

      <div className="relative">
        <Link href="/">
          <Logo size={36} inverted className="text-lg tracking-[0.02em]" />
        </Link>
      </div>

      <div className="relative max-md:hidden">
        <h2 className="mb-7 font-heading text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-white">
          Tudo que um coach
          <br />
          precisa, em um só lugar.
        </h2>
        <ul className="flex flex-col gap-4">
          {highlights.map(({ icon: Icon, title, description }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white/15">
                <Icon className="size-[18px] text-white" strokeWidth={2} />
              </span>
              <div>
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="text-body-dense leading-snug text-white/70">
                  {description}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative max-md:hidden">
        <p className="text-body-dense text-white/60">
          14 dias grátis · sem cartão de crédito
        </p>
      </div>
    </div>
  );
}
