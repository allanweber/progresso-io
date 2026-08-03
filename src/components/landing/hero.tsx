import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="bg-gradient-to-b from-primary-light to-white px-6 py-20">
      <div className="mx-auto grid max-w-[1120px] items-center gap-16 lg:grid-cols-2">
        <div>
          <Badge className="mb-6">
            <MessageCircle className="size-3.5" strokeWidth={2.5} />
            WhatsApp integrado ao seu workflow
          </Badge>

          <h1 className="mb-5 font-heading text-[clamp(38px,5vw,60px)] font-bold leading-[1.1] tracking-[-0.03em] text-foreground">
            Gerencie seus alunos.
            <br />
            <span className="text-primary">Automatize o WhatsApp.</span>
            <br />
            Cresça de verdade.
          </h1>

          <p className="mb-9 max-w-[460px] text-[clamp(16px,2vw,19px)] leading-[1.65] text-text-secondary">
            Progresso IO reúne treinos, dietas, check-ins e mensagens
            automáticas em um único lugar. Menos tempo no celular, mais
            resultado para seus alunos.
          </p>

          <div className="flex flex-col items-start gap-3.5 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link href="/registro">
                Começar 14 dias grátis
                <ArrowRight className="size-4" strokeWidth={2.5} />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#features">Ver funcionalidades</a>
            </Button>
          </div>
        </div>

        {/* Decorative product mockup — purely presentational, no real data. */}
        <div className="hidden aspect-[4/3] overflow-hidden rounded-[20px] bg-surface-dark shadow-[0_32px_80px_rgba(15,23,42,0.25)] lg:block">
          {/* Window chrome */}
          <div className="flex h-9 items-center gap-1.5 bg-surface-dark-mid px-3.5">
            <span className="size-2.5 rounded-full bg-[#EF4444]" />
            <span className="size-2.5 rounded-full bg-[#F59E0B]" />
            <span className="size-2.5 rounded-full bg-[#10B981]" />
            <span className="mx-5 h-[18px] flex-1 rounded bg-[#334155]" />
          </div>

          <div className="grid h-[calc(100%-36px)] grid-cols-[140px_1fr] gap-3.5 p-4">
            {/* Sidebar */}
            <div className="flex flex-col gap-1.5 rounded-[10px] bg-surface-dark-mid p-2">
              <div className="flex items-center gap-2 rounded-md bg-primary px-2 py-1.5">
                <span className="size-3 rounded-[3px] bg-white/80" />
                <span className="h-2 w-[50px] rounded-[3px] bg-white" />
              </div>
              {[40, 44, 38].map((w, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                  <span className="size-3 rounded-[3px] bg-[#334155]" />
                  <span
                    className="h-2 rounded-[3px] bg-[#334155]"
                    style={{ width: w }}
                  />
                </div>
              ))}
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="size-3 rounded-[3px] bg-[#334155]" />
                <span className="relative h-2 w-[46px] rounded-[3px] bg-[#334155]">
                  <span className="absolute -right-5 -top-0.5 flex h-3 w-[18px] items-center justify-center rounded-md bg-primary text-[8px] font-bold text-white">
                    3
                  </span>
                </span>
              </div>
            </div>

            {/* Main */}
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-4 gap-2">
                <StatTile value="12" valueClass="text-primary" />
                <StatTile value="4" valueClass="text-[#F8FAFC]" />
                <StatTile value="R$3.8k" valueClass="text-[#F8FAFC] !text-sm" />
                <StatTile value="2" valueClass="text-[#EF4444]" danger />
              </div>
              <div className="flex-1 rounded-lg bg-surface-dark-mid p-3">
                <div className="mb-2.5 h-2 w-[100px] rounded-[3px] bg-[#334155]" />
                <MockRow avatar="bg-primary" positive />
                <MockRow avatar="bg-[#7C3AED]" positive={false} />
                <MockRow avatar="bg-[#D97706]" positive last />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatTile({
  value,
  valueClass,
  danger,
}: {
  value: string;
  valueClass: string;
  danger?: boolean;
}) {
  return (
    <div className={`rounded-lg p-2.5 ${danger ? "bg-[#3B1919]" : "bg-surface-dark-mid"}`}>
      <div
        className={`mb-1.5 h-1.5 w-7 rounded-[3px] ${danger ? "bg-[#7F1D1D]" : "bg-[#334155]"}`}
      />
      <div className={`font-heading text-lg font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

function MockRow({
  avatar,
  positive,
  last,
}: {
  avatar: string;
  positive: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 py-1.5 ${last ? "" : "border-b border-[#334155]"}`}
    >
      <span className={`size-[22px] flex-shrink-0 rounded-full ${avatar}`} />
      <span className="h-[7px] flex-1 rounded-[3px] bg-[#475569]" />
      <span
        className={`h-4 w-[30px] rounded ${
          positive ? "bg-primary/20" : "bg-[#EF4444]/20"
        }`}
      />
    </div>
  );
}
