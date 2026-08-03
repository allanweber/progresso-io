import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { HeroMockup } from "./hero-mockup";

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

        <HeroMockup />
      </div>
    </section>
  );
}
