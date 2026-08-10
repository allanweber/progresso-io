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
import { studentRegistrationSchema, type StudentDto } from "@/lib/students";

/**
 * The merged "Convidar novo aluno" screen. One action: it creates the student,
 * assigns (snapshots) the chosen anamnese, and — for an ONLINE student — sends
 * the WhatsApp onboarding (portal + anamnese links); an OFFLINE student is
 * created and the coach is taken straight to fill the anamnese. Built on
 * TanStack Form + TanStack Query, validated with the same zod schema the API
 * uses.
 */

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
      // Online → back to the profile (links already sent). Offline → straight to
      // filling the anamnese (per "após, encaminha para o preenchimento").
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
    validators: { onChange: studentRegistrationSchema },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
      } catch {
        /* surfaced via mutation.error */
      }
    },
  });

  // Default the anamnese select to the first template once they load.
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
        {(modality) => (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <form.Field name="phone">
              {(field) => (
                <Field
                  id="phone"
                  label="WhatsApp"
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
                  label={
                    modality === "online" ? "E-mail" : "E-mail (opcional)"
                  }
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
        )}
      </form.Subscribe>

      <form.Field name="anamnesisId">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="anamnesisId">Anamnese a enviar</Label>
            <Select
              value={field.state.value || undefined}
              onValueChange={(v) => field.handleChange(v)}
              disabled={templates.isLoading || items.length === 0}
            >
              <SelectTrigger id="anamnesisId" onBlur={field.handleBlur}>
                <SelectValue
                  placeholder={
                    templates.isLoading ? "Carregando…" : "Selecione uma anamnese"
                  }
                />
              </SelectTrigger>
              <SelectContent>
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
            {modality === "online"
              ? "O aluno receberá uma mensagem no WhatsApp com o link de acesso e o formulário de anamnese."
              : "O aluno não recebe acesso ao portal. Após registrar, você preenche a anamnese dele."}
          </div>
        )}
      </form.Subscribe>

      <form.Subscribe selector={(s) => s.values.modality}>
        {(modality) => (
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Enviando…"
                : modality === "online"
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
        )}
      </form.Subscribe>
    </form>
  );
}
