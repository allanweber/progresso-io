"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Check } from "lucide-react";

import { sendContactMessage } from "@/app/actions/contact";
import { CONTACT_LIMITS } from "@/lib/contact";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Read straight from the environment rather than imported from
 * `@/lib/turnstile`: that module is server-side (it holds the secret and logs
 * through `node:async_hooks`), and pulling it into a client component drags the
 * whole server observability tree into the browser bundle. `NEXT_PUBLIC_*` is
 * inlined at build time only when referenced literally like this — assigning
 * `process.env` to a variable first defeats the substitution.
 */
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function ContactForm() {
  const [state, formAction] = useActionState(sendContactMessage, undefined);

  // Stamped onto the DOM node after mount, never during render: this page is
  // statically prerendered, so a build-time timestamp would already be hours
  // old by the time anyone loaded it, and stamping during hydration would
  // mismatch the served HTML. Written through a ref rather than state because
  // nothing renders it — it exists only to be posted — so a re-render would buy
  // nothing. It stays empty when scripting is off, which the action reads as
  // "no timestamp" and skips the timing check rather than dropping the message.
  const [messageLength, setMessageLength] = useState(0);

  const renderedAt = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renderedAt.current) renderedAt.current.value = String(Date.now());
  }, []);

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
          maxLength={CONTACT_LIMITS.name}
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
          maxLength={CONTACT_LIMITS.email}
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
            maxLength={CONTACT_LIMITS.message}
            required
            aria-invalid={state?.fieldErrors?.message ? true : undefined}
            aria-describedby={
              state?.fieldErrors?.message ? "message-error" : undefined
            }
            onChange={(e) => setMessageLength(e.currentTarget.value.length)}
          />
          {/* A `maxLength` textarea just stops accepting keystrokes, with no
              hint why — so the budget is shown rather than left to be
              discovered by typing into a field that has gone dead. */}
          <p className="text-right text-[12px] text-muted-foreground">
            {messageLength}/{CONTACT_LIMITS.message}
          </p>
          {state?.fieldErrors?.message && (
            <p id="message-error" className="text-[13px] text-destructive">
              {state.fieldErrors.message}
            </p>
          )}
        </div>
      </div>

      {/*
        Cloudflare Turnstile — the visible half of the bot check. Implicit
        rendering: the script finds this div by class and injects the
        `cf-turnstile-response` field into the enclosing form itself, so there
        is no token state to thread through React.

        Rendered only when a site key is configured, which is what keeps local
        dev and the e2e suite working without a Cloudflare account — the server
        skips verification in exactly the same case. `pt-BR` because the widget
        speaks to the visitor and the rest of this page is Portuguese.
      */}
      {TURNSTILE_SITE_KEY !== "" && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            strategy="lazyOnload"
          />
          <div
            className="cf-turnstile mt-5"
            data-sitekey={TURNSTILE_SITE_KEY}
            data-language="pt-BR"
          />
        </>
      )}

      {/*
        Bot traps; see `sendContactMessage` for what each one catches.

        Off-screen rather than `display: none` or `type="hidden"` — a scraper
        that skips those still fills anything with a plausible name, which is
        the whole point. `aria-hidden` plus `tabIndex={-1}` keep it away from
        screen readers and the tab order, so no real visitor can reach it: a
        filled `website` means a machine filled it.
      */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] size-0 overflow-hidden"
      >
        <label htmlFor="website">Não preencha este campo</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <input ref={renderedAt} type="hidden" name="renderedAt" defaultValue="" />

      <SubmitButton size="lg" className="mt-5 w-full" pendingLabel="Enviando…">
        Enviar mensagem
      </SubmitButton>
    </form>
  );
}
