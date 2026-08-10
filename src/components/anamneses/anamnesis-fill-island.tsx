"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";

import { AnamnesisFillForm } from "@/components/anamneses/anamnesis-fill-form";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ApiError, apiFetch } from "@/lib/api-client";
import { validateAnswers } from "@/lib/anamneses";
import type {
  AnamnesisAnswers,
  AnamnesisAnswerValue,
  FillPageState,
} from "@/lib/student-anamneses";

/**
 * The public fill island: loads the questionnaire for a token, asks the aluno to
 * confirm their WhatsApp (the credential), collects answers, and submits. On
 * success shows a thank-you. All traffic goes through the public
 * `/api/anamnesis/fill` endpoint.
 */
export function AnamnesisFillIsland({ token }: { token: string }) {
  const [answers, setAnswers] = useState<AnamnesisAnswers>({});
  const [phone, setPhone] = useState("");
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const state = useQuery({
    queryKey: ["anamnesis-fill", token],
    queryFn: () =>
      apiFetch<FillPageState>(
        `/api/anamnesis/fill?token=${encodeURIComponent(token)}`,
      ),
    enabled: token.length > 0,
    retry: false,
  });

  const submit = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>("/api/anamnesis/fill", {
        method: "POST",
        body: JSON.stringify({ token, phone, answers }),
      }),
  });

  const card =
    "w-full max-w-2xl rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)] sm:p-8";

  if (state.isLoading) {
    return (
      <div className={card}>
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  if (!state.data || state.data.valid === false) {
    return (
      <div className={card}>
        <Logo />
        <h1 className="mt-6 font-heading text-xl font-bold text-foreground">
          Link inválido ou expirado
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Este link de anamnese não é mais válido. Peça um novo ao seu coach.
        </p>
      </div>
    );
  }

  if (submit.isSuccess) {
    return (
      <div className={card}>
        <Logo />
        <div className="mt-6 flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-primary" />
          <div>
            <h1 className="font-heading text-xl font-bold text-foreground">
              Anamnese enviada!
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Obrigado, {state.data.studentFirstName}. Suas respostas foram
              enviadas para {state.data.clinicName}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const s = state.data;
  const banner = submit.error instanceof ApiError ? submit.error.message : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const errs = validateAnswers(s.sections, answers);
        setClientErrors(errs);
        if (Object.keys(errs).length === 0) submit.mutate();
      }}
      className={card}
    >
      <Logo />
      <h1 className="mt-6 font-heading text-2xl font-bold text-foreground">
        {s.name}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Olá, {s.studentFirstName}! {s.clinicName} pediu que você preencha esta
        anamnese. Confirme seu WhatsApp para começar.
      </p>

      <div className="mt-6 space-y-6">
        <Field
          id="confirm-phone"
          label="Seu WhatsApp"
          placeholder={s.phoneHint ? `•••• ${s.phoneHint}` : "+55 11 99999-0000"}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={
            submit.error instanceof ApiError && submit.error.status === 403
              ? submit.error.message
              : undefined
          }
        />

        <div className="border-t border-border pt-6">
          <AnamnesisFillForm
            sections={s.sections}
            answers={answers}
            onAnswer={(key: string, value: AnamnesisAnswerValue) => {
              setAnswers((prev) => ({ ...prev, [key]: value }));
              setClientErrors((prev) => {
                if (!(key in prev)) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
              });
            }}
            disabled={submit.isPending}
            errors={{
              ...(submit.error instanceof ApiError
                ? (submit.error.fieldErrors ?? {})
                : {}),
              ...clientErrors,
            }}
          />
        </div>

        {banner && submit.error instanceof ApiError && submit.error.status !== 403 && (
          <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
            {banner}
          </div>
        )}

        <Button type="submit" disabled={submit.isPending} className="w-full sm:w-auto">
          {submit.isPending ? "Enviando…" : "Enviar anamnese"}
        </Button>
      </div>
    </form>
  );
}
