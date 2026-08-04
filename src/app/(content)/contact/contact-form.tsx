"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";

import { sendContactMessage } from "@/app/actions/contact";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

export function ContactForm() {
  const [state, formAction] = useActionState(sendContactMessage, undefined);

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-[0_2px_16px_rgba(15,23,42,0.05)]">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[#DCFCE7]">
          <Check className="size-7 text-primary" strokeWidth={2.5} />
        </div>
        <h2 className="font-heading text-lg font-bold text-foreground">
          Mensagem enviada!
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Obrigado pelo contato. Retornamos em breve.
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-border bg-white p-6 shadow-[0_2px_16px_rgba(15,23,42,0.05)]"
    >
      {state?.formError && (
        <p
          role="alert"
          className="mb-4 rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive"
        >
          {state.formError}
        </p>
      )}

      <div className="space-y-4">
        <Field
          id="name"
          name="name"
          label="Nome"
          placeholder="Seu nome"
          autoComplete="name"
          required
          error={state?.fieldErrors?.name}
        />
        <Field
          id="email"
          name="email"
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          required
          error={state?.fieldErrors?.email}
        />
        <div className="space-y-1.5">
          <Label htmlFor="message">Mensagem</Label>
          <Textarea
            id="message"
            name="message"
            rows={5}
            placeholder="Como podemos ajudar?"
            required
            aria-invalid={state?.fieldErrors?.message ? true : undefined}
            aria-describedby={
              state?.fieldErrors?.message ? "message-error" : undefined
            }
          />
          {state?.fieldErrors?.message && (
            <p id="message-error" className="text-[13px] text-destructive">
              {state.fieldErrors.message}
            </p>
          )}
        </div>
      </div>

      <SubmitButton size="lg" className="mt-5 w-full" pendingLabel="Enviando…">
        Enviar mensagem
      </SubmitButton>
    </form>
  );
}
