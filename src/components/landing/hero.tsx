import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The hero, with **real product screenshots**.
 *
 * These used to be a mockup drawn in CSS — window chrome, grey bars where text
 * would go, invented numbers. It photographed well and said nothing: a visitor
 * deciding whether this tool builds the plans they build could learn nothing
 * from a rectangle. The screenshots are the actual app on actual data (a real
 * TACO food list, real macros, a real published version), captured by the e2e
 * suite so they cannot drift away from what ships.
 *
 * Two images, not one, because the product is two products: the coach's
 * workspace on a desktop and the aluno's plan on a phone. Showing only the
 * first hides the half that the aluno actually experiences.
 */
export function Hero() {
  return (
    <section className="bg-gradient-to-b from-primary-light to-white px-6 pb-32 pt-20">
      <div className="mx-auto max-w-[760px] text-center">
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

        <p className="mx-auto mb-9 max-w-[520px] text-[clamp(16px,2vw,19px)] leading-[1.65] text-text-secondary">
          Progresso IO reúne treinos, dietas, check-ins e mensagens automáticas
          em um único lugar. Menos tempo no celular, mais resultado para seus
          alunos.
        </p>

        <div className="flex flex-col items-center gap-3.5 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            <Link href="/register">
              Começar 14 dias grátis
              <ArrowRight className="size-4" strokeWidth={2.5} />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#features">Ver funcionalidades</a>
          </Button>
        </div>
      </div>

      {/*
        The screenshots sit BELOW the copy rather than beside it, and that is
        the whole reason they are readable. A 1440px-wide app screenshot in a
        half-width hero column renders at ~0.4 scale, which turns every label
        into a grey smudge — indistinguishable from the CSS mockup this
        replaced. Full container width keeps it near 0.78 and legible.
      */}
      <div className="relative mx-auto mt-16 max-w-[1120px]">
        <div className="hidden overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_32px_80px_rgba(15,23,42,0.22)] lg:block">
          <Image
            src="/landing/app-dashboard.png"
            alt="Painel do Progresso IO com a fila do dia: check-ins aguardando resposta, agenda e conversas de WhatsApp"
            width={1440}
            height={800}
            // The largest paint on the page, above the fold: it must not wait
            // for an intersection observer.
            priority
            className="block h-auto w-full"
          />
        </div>

        {/*
          The aluno's phone, overlapping the empty bottom-left of the panel —
          the one region of that screenshot with nothing in it, so the overlap
          costs no information.
        */}
        <div className="absolute -bottom-16 -left-10 hidden w-[186px] overflow-hidden rounded-[26px] border-[6px] border-surface-dark bg-surface-dark shadow-[0_24px_48px_rgba(15,23,42,0.3)] lg:block">
          <Image
            src="/landing/app-portal.png"
            alt="O plano do aluno no celular, com porções em medidas caseiras e substituições"
            width={390}
            height={844}
            priority
            className="block h-auto w-full rounded-[20px]"
          />
        </div>

        {/* Below lg the desktop shot would be unreadable, so the phone — which
            is what an aluno actually holds — carries the section alone. */}
        <div className="mx-auto w-[240px] overflow-hidden rounded-[30px] border-[7px] border-surface-dark bg-surface-dark shadow-[0_24px_48px_rgba(15,23,42,0.3)] lg:hidden">
          <Image
            src="/landing/app-portal.png"
            alt="O plano do aluno no celular, com porções em medidas caseiras e substituições"
            width={390}
            height={844}
            priority
            className="block h-auto w-full rounded-[24px]"
          />
        </div>
      </div>
    </section>
  );
}
