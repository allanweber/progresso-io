"use client";

import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { Modality } from "@/db/schema";
import { fieldError } from "@/lib/form";
import {
  ANAMNESIS_OBJECTIVE_LABELS,
  ANAMNESIS_MODALITY_LABELS,
  type AnamnesisListResponse,
} from "@/lib/anamneses";
import type { PlanUsageDto } from "@/lib/plans";
import { makeStudentRegistrationSchema, type StudentDto } from "@/lib/students";

/**
 * The merged "Convidar novo aluno" screen. One action: it creates the student,
 * optionally assigns (snapshots) an anamnese, and — for an ONLINE student on a
 * plan with WhatsApp — sends the WhatsApp anamnese fill link (portal access
 * follows on the first published diet/workout); an OFFLINE student is created and
 * the coach is taken to fill the anamnese. On the free plan WhatsApp isn't
 * available, so neither WhatsApp nor e-mail is required and no WhatsApp link is
 * sent. Built on TanStack Form + TanStack Query, validated with the same
 * (plan-aware) zod schema the API uses.
 */

// Radix Select can't hold an empty value, so "no anamnese" uses this sentinel.
const NO_ANAMNESIS = "__none__";

type RegisterValues = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  goal: string;
  modality: Modality;
  anamnesisId: string;
};

const EMPTY: RegisterValues = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  goal: "",
  modality: "online",
  anamnesisId: "",
};

type RegisterResponse = { student: StudentDto; access: Modality; sent: boolean };

export function StudentRegisterForm() {
  // Gate the form on the plan capability so the schema (and copy) mount correct:
  // free clinics don't require WhatsApp/e-mail and don't send WhatsApp links.
  const usage = useQuery({
    queryKey: ["coach-plan-usage"],
    queryFn: () => apiFetch<PlanUsageDto>("/api/coach/plan-usage"),
  });

  if (usage.isLoading || !usage.data) {
    return (
      <p className="text-sm text-muted-foreground">Carregando…</p>
    );
  }

  return <RegisterFormBody hasWhatsapp={usage.data.whatsapp} />;
}

function RegisterFormBody({ hasWhatsapp }: { hasWhatsapp: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const templates = useQuery({
    queryKey: ["anamneses", "templates"],
    queryFn: () =>
      apiFetch<AnamnesisListResponse>("/api/anamneses?pageSize=100"),
  });

  const mutation = useMutation({
    mutationFn: (values: RegisterValues) =>
      apiFetch<RegisterResponse>("/api/students", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["coach-plan-usage"] });
      // Online → back to the profile; offline (or online with no anamnese to
      // send) → straight to filling the anamnese.
      if (data.access === "online") {
        router.push(`/coach/students/${data.student.id}`);
      } else {
        router.push(`/coach/students/${data.student.id}/anamnesis`);
      }
      router.refresh();
    },
  });

  const form = useForm({
    defaultValues: EMPTY,
    validators: { onChange: makeStudentRegistrationSchema(hasWhatsapp) },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
      } catch {
        /* surfaced via mutation.error */
      }
    },
  });

  // Default the anamnese select to the first template once they load (a
  // convenience default — the anamnese is optional; "Nenhuma" clears it).
  const items = templates.data?.items ?? [];
  useEffect(() => {
    if (items.length && !form.getFieldValue("anamnesisId")) {
      form.setFieldValue("anamnesisId", items[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const serverErrors =
    mutation.error instanceof ApiError ? mutation.error.fieldErrors : undefined;
  const banner =
    mutation.error instanceof ApiError && !mutation.error.fieldErrors
      ? mutation.error.message
      : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-5"
    >
      {banner && (
        <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
          {banner}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <form.Field name="firstName">
          {(field) => (
            <Field
              id="firstName"
              label="Nome"
              placeholder="Juliana"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              error={fieldError(field, serverErrors?.firstName)}
            />
          )}
        </form.Field>
        <form.Field name="lastName">
          {(field) => (
            <Field
              id="lastName"
              label="Sobrenome"
              placeholder="Santos"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              error={fieldError(field, serverErrors?.lastName)}
            />
          )}
        </form.Field>
      </div>

      <form.Subscribe selector={(s) => s.values.modality}>
        {(modality) => {
          // On a plan with WhatsApp, an online student needs both identifiers;
          // free clinics require neither (WhatsApp isn't available there).
          const contactRequired = hasWhatsapp && modality === "online";
          return (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <form.Field name="phone">
                {(field) => (
                  <Field
                    id="phone"
                    label={hasWhatsapp ? "WhatsApp" : "WhatsApp (opcional)"}
                    placeholder="+55 11 99999-0000"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    error={fieldError(field, serverErrors?.phone)}
                  />
                )}
              </form.Field>
              <form.Field name="email">
                {(field) => (
                  <Field
                    id="email"
                    type="email"
                    label={contactRequired ? "E-mail" : "E-mail (opcional)"}
                    placeholder="juliana@email.com"
                    autoComplete="off"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    error={fieldError(field, serverErrors?.email)}
                  />
                )}
              </form.Field>
            </div>
          );
        }}
      </form.Subscribe>

      <form.Field name="anamnesisId">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="anamnesisId">Anamnese (opcional)</Label>
            <Select
              value={field.state.value === "" ? NO_ANAMNESIS : field.state.value}
              onValueChange={(v) =>
                field.handleChange(v === NO_ANAMNESIS ? "" : v)
              }
              disabled={templates.isLoading}
            >
              <SelectTrigger id="anamnesisId" onBlur={field.handleBlur}>
                <SelectValue
                  placeholder={
                    templates.isLoading ? "Carregando…" : "Nenhuma"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ANAMNESIS}>
                  Nenhuma (preencho depois)
                </SelectItem>
                {items.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {ANAMNESIS_OBJECTIVE_LABELS[a.objective]}
                    {" · "}
                    {ANAMNESIS_MODALITY_LABELS[a.modality]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError(field, serverErrors?.anamnesisId) && (
              <p className="text-[13px] text-destructive">
                {fieldError(field, serverErrors?.anamnesisId)}
              </p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field name="goal">
        {(field) => (
          <Field
            id="goal"
            label="Objetivo (opcional)"
            placeholder="Hipertrofia, emagrecimento…"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
            error={fieldError(field, serverErrors?.goal)}
          />
        )}
      </form.Field>

      <form.Field name="modality">
        {(field) => (
          <div className="space-y-2">
            <Label>Tipo de acesso</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    value: "online" as const,
                    title: "Portal online",
                    hint: "treinos e dietas no app",
                  },
                  {
                    value: "in_person" as const,
                    title: "Offline / presencial",
                    hint: "sem acesso ao portal",
                  },
                ]
              ).map((opt) => {
                const active = field.state.value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => field.handleChange(opt.value)}
                    className={cn(
                      "rounded-[12px] border-[1.5px] px-4 py-3 text-left transition-colors",
                      active
                        ? "border-primary bg-primary-light"
                        : "border-input hover:bg-secondary",
                    )}
                  >
                    <div
                      className={cn(
                        "text-sm font-semibold",
                        active ? "text-primary" : "text-foreground",
                      )}
                    >
                      {opt.title}
                    </div>
                    <div className="mt-0.5 text-[13px] text-muted-foreground">
                      {opt.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.modality}>
        {(modality) => (
          <div className="rounded-[10px] bg-[#EFF6FF] px-4 py-3 text-[13px] text-[#1D4ED8]">
            {modality !== "online"
              ? "O aluno não recebe acesso ao portal. Após registrar, você preenche a anamnese dele."
              : hasWhatsapp
                ? "O aluno receberá no WhatsApp o link para preencher a anamnese. O acesso ao portal é enviado quando você publicar a primeira dieta ou treino."
                : "O acesso ao portal é enviado por e-mail quando você publicar a primeira dieta ou treino. O envio automático por WhatsApp está disponível nos planos pagos."}
          </div>
        )}
      </form.Subscribe>

      <form.Subscribe selector={(s) => s.values.modality}>
        {(modality) => {
          // "Enviar convite" only when an online student is actually invited over
          // WhatsApp; otherwise it's just a registration.
          const sendsInvite = modality === "online" && hasWhatsapp;
          return (
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending
                  ? "Salvando…"
                  : sendsInvite
                    ? "Enviar convite"
                    : "Registrar aluno"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={mutation.isPending}
              >
                Cancelar
              </Button>
            </div>
          );
        }}
      </form.Subscribe>
    </form>
  );
}
