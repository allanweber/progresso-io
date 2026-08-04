import type { Metadata } from "next";
import { Mail, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Contato — Progresso IO",
  description: "Fale com a equipe do Progresso IO.",
};

const SUPPORT_EMAIL = "contato@progresso.io";

export default function ContactPage() {
  return (
    <>
      <h1 className="font-heading text-[32px] font-bold tracking-[-0.02em] text-foreground">
        Contato
      </h1>
      <p className="mt-2 text-sm leading-[1.7] text-muted-foreground">
        Ficou com alguma dúvida ou tem uma sugestão? A gente adora conversar.
        Respondemos normalmente em até um dia útil.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_2px_16px_rgba(15,23,42,0.05)]">
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary-light">
            <Mail className="size-5 text-primary" strokeWidth={2} />
          </div>
          <h2 className="font-heading text-base font-bold text-foreground">
            E-mail
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Para suporte, parcerias ou imprensa.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>

        <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_2px_16px_rgba(15,23,42,0.05)]">
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary-light">
            <MessageCircle className="size-5 text-primary" strokeWidth={2} />
          </div>
          <h2 className="font-heading text-base font-bold text-foreground">
            Suporte
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Já é cliente? Fale com a gente direto pelo painel, na opção de ajuda.
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl bg-primary px-6 py-8 text-center">
        <h2 className="font-heading text-lg font-bold text-white">
          Prefere começar agora?
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-white/80">
          Crie sua conta gratuitamente e conheça o Progresso IO na prática.
        </p>
        <Button asChild variant="secondary" size="lg" className="mt-4">
          <a href="/register">Começar grátis</a>
        </Button>
      </div>
    </>
  );
}
