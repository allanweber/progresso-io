import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CallToAction() {
  return (
    <section className="bg-primary px-6 py-20">
      <div className="mx-auto max-w-[1120px] text-center">
        <h2 className="mb-4 font-heading text-[clamp(28px,4vw,44px)] font-bold tracking-[-0.02em] text-white">
          Pronto para transformar sua gestão?
        </h2>
        <p className="mx-auto mb-9 max-w-[500px] text-[17px] text-white/80">
          14 dias grátis. Sem cartão. Sem compromisso. Configure em menos de 5
          minutos.
        </p>
        <Link
          href="/registro"
          className="inline-flex items-center gap-2.5 rounded-xl bg-white px-8 py-4 text-base font-bold text-primary transition-opacity hover:opacity-90"
        >
          Criar minha conta grátis
          <ArrowRight className="size-[18px]" strokeWidth={2.5} />
        </Link>
      </div>
    </section>
  );
}
