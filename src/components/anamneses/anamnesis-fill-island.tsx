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
  FillRevealDto,
} from "@/lib/student-anamneses";

/**
 * The public fill island. Two steps, because the WhatsApp number is the
 * credential: first the aluno confirms their number (checked against the one on
 * file); only then is the questionnaire revealed and submitted. On success shows
 * a thank-you. All traffic goes through the public `/api/anamnesis/fill*`
 * endpoints — no session.
 */
export function AnamnesisFillIsland({ token }: { token: string }) {
  const [answers, setAnswers] = useState<AnamnesisAnswers>({});
  const [phone, setPhone] = useState("");
  // The identity + questionnaire, held back by the API until the WhatsApp number
  // is confirmed. Null until then — its presence IS the "confirmed" state.
  const [reveal, setReveal] = useState<FillRevealDto | null>(null);
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

  // Step 1: confirm the WhatsApp number. On success the server returns the
  // identity + questionnaire (withheld pre-confirm), which unlocks step 2.
  const confirm = useMutation({
    mutationFn: () =>
      apiFetch<FillRevealDto>("/api/anamnesis/fill/confirm", {
        method: "POST",
        body: JSON.stringify({ token, phone }),
      }),
    onSuccess: (data) => setReveal(data),
  });

  // Step 2: submit the answers (re-verifies the number server-side).
  const submit = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>("/api/anamnesis/fill", {
        method: "POST",
        body: JSON.stringify({ token, phone, answers }),
      }),
  });

  // Short states (loading / invalid / success / confirm) sit in a compact,
  // vertically-centered card — no dead space. The long questionnaire uses a
  // wider, top-anchored layout that scrolls.
  const centered =
    "flex min-h-screen items-center justify-center px-4 py-10";
  const shortCard =
    "w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)] sm:p-8";

  if (state.isLoading) {
    return (
      <div className={centered}>
        <div className={shortCard}>
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </div>
      </div>
    );
  }

  if (!state.data || state.data.valid === false) {
    return (
      <div className={centered}>
        <div className={shortCard}>
          <Logo />
          <h1 className="mt-6 font-heading text-xl font-bold text-foreground">
            Link inválido ou expirado
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este link de anamnese não é mais válido. Peça um novo ao seu coach.
          </p>
        </div>
      </div>
    );
  }

  if (submit.isSuccess) {
    return (
      <div className={centered}>
        <div className={shortCard}>
          <Logo />
          <div className="mt-6 flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-primary" />
            <div>
              <h1 className="font-heading text-xl font-bold text-foreground">
                Anamnese enviada!
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Obrigado{reveal?.studentFirstName ? `, ${reveal.studentFirstName}` : ""}.
                Suas respostas foram enviadas para {state.data.clinicName}.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const s = state.data;

  // Step 1 — confirm the WhatsApp number. The questionnaire (and who this is for)
  // stays hidden — server-side, not just visually — until the number matches the
  // one on file. Centered compact card (little content).
  if (!reveal) {
    const confirmError =
      confirm.error instanceof ApiError ? confirm.error.message : undefined;
    return (
      <div className={centered}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (phone.trim()) confirm.mutate();
          }}
          className={shortCard}
        >
          <Logo />
          <h1 className="mt-6 font-heading text-xl font-bold text-foreground">
            {s.name}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {s.clinicName} pediu que você preencha esta anamnese. Confirme seu
            WhatsApp para começar.
          </p>

          <div className="mt-6 space-y-5">
            <Field
              id="confirm-phone"
              label="Seu WhatsApp"
              inputMode="tel"
              placeholder="+55 11 99999-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={confirmError}
            />

            <Button
              type="submit"
              disabled={confirm.isPending || phone.trim().length === 0}
              className="w-full"
            >
              {confirm.isPending ? "Confirmando…" : "Confirmar WhatsApp"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // Step 2 — the questionnaire (revealed only after confirmation). Wider, top-
  // anchored so a long form scrolls naturally.
  const banner = submit.error instanceof ApiError ? submit.error.message : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const errs = validateAnswers(reveal.sections, answers);
        setClientErrors(errs);
        if (Object.keys(errs).length === 0) submit.mutate();
      }}
      className="mx-auto my-10 w-full max-w-2xl rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)] sm:p-8"
    >
      <Logo />
      <h1 className="mt-6 font-heading text-2xl font-bold text-foreground">
        {s.name}
      </h1>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 shrink-0 text-primary" />
        WhatsApp confirmado. Preencha os campos abaixo, {reveal.studentFirstName}.
      </p>

      <div className="mt-6 space-y-6">
        <AnamnesisFillForm
          sections={reveal.sections}
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

        {banner && (
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
