import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contato — Progresso IO",
  description: "Fale com a equipe do Progresso IO.",
};

export default function ContactPage() {
  return (
    <>
      <h1 className="font-heading text-[32px] font-bold tracking-[-0.02em] text-foreground">
        Contato
      </h1>
      <p className="mt-2 text-sm leading-[1.7] text-muted-foreground">
        Ficou com alguma dúvida ou tem uma sugestão? Preencha o formulário abaixo
        e a gente retorna — normalmente em até um dia útil.
      </p>

      <div className="mt-8">
        <ContactForm />
      </div>

      <div className="mt-8 rounded-2xl bg-primary px-6 py-8 text-center">
        <h2 className="font-heading text-lg font-bold text-white">
          Prefere começar agora?
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-white/80">
          Crie sua conta gratuitamente e conheça o Progresso IO na prática.
        </p>
        <Button asChild variant="secondary" size="lg" className="mt-4">
          <Link href="/register">Começar grátis</Link>
        </Button>
      </div>
    </>
  );
}
