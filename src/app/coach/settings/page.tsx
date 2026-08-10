"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

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
import { ApiError, apiFetch } from "@/lib/api-client";
import type { FeedbackFrequency, Weekday } from "@/db/schema";
import {
  clinicSettingsSchema,
  type ClinicSettingsDto,
  FEEDBACK_FREQUENCY_LABELS,
  FEEDBACK_FREQUENCY_VALUES,
  WEEKDAY_LABELS,
  WEEKDAY_VALUES,
} from "@/lib/clinic-settings";
import { fieldError } from "@/lib/form";
import { PLAN_META } from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * Clinic configuration ("Configurações"). Client page → GET/PUT
 * /api/coach/settings via TanStack Query, per the frontend rules. Two sections
 * are real and editable — Clínica (name + portal subdomain) and Preferências de
 * feedback — and the rest of the mockup (WhatsApp Business, Equipe de coaches)
 * renders a permanent "Em breve"; Plano atual shows the clinic's real plan.
 */

/** Card chrome with a titled header, shared by every settings section. */
function SettingsCard({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_8px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <h2 className="font-heading text-[15px] font-semibold text-foreground">
          {title}
        </h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

/** Body for a section whose feature isn't built yet. */
function ComingSoon() {
  return (
    <div className="py-6 text-center">
      <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
        Em breve
      </span>
    </div>
  );
}

type SettingsFormValues = {
  name: string;
  portalSubdomain: string;
  feedbackFrequency: FeedbackFrequency;
  feedbackPreferredDay: Weekday;
  feedbackWhatsappReminder: boolean;
};

function toValues(dto: ClinicSettingsDto): SettingsFormValues {
  return {
    name: dto.name,
    portalSubdomain: dto.portalSubdomain ?? "",
    feedbackFrequency: dto.feedbackFrequency,
    feedbackPreferredDay: dto.feedbackPreferredDay,
    feedbackWhatsappReminder: dto.feedbackWhatsappReminder,
  };
}

/**
 * The settings form itself. Split from the page (a technical boundary: the form
 * needs the loaded settings as stable default values, so it mounts only once
 * the query has resolved).
 */
function ClinicSettingsForm({ initial }: { initial: ClinicSettingsDto }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (values: SettingsFormValues) =>
      apiFetch<ClinicSettingsDto>("/api/coach/settings", {
        method: "PUT",
        body: JSON.stringify(values),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["coach-settings"], data);
    },
  });

  const form = useForm({
    defaultValues: toValues(initial),
    validators: { onChange: clinicSettingsSchema },
    onSubmit: async ({ value, formApi }) => {
      try {
        const saved = await mutation.mutateAsync(value);
        // Rebaseline the form to the saved values so it's no longer "dirty"
        // (server normalizes, e.g. an empty subdomain → null) and the "Salvo"
        // confirmation shows until the next edit.
        formApi.reset(toValues(saved));
      } catch {
        /* surfaced via mutation.error below */
      }
    },
  });

  const serverErrors =
    mutation.error instanceof ApiError ? mutation.error.fieldErrors : undefined;
  const banner =
    mutation.error instanceof ApiError && !mutation.error.fieldErrors
      ? mutation.error.message
      : undefined;

  const plan = PLAN_META[initial.plan];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="mx-auto max-w-5xl"
    >
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-foreground sm:text-[28px]">
          Configurações
        </h1>
        <div className="flex items-center gap-3">
          {mutation.isSuccess && !form.state.isDirty ? (
            <span className="flex items-center gap-1 text-[13px] font-medium text-primary">
              <Check className="size-4" />
              Salvo
            </span>
          ) : null}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>

      {banner ? (
        <div className="mb-4 rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
          {banner}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* Clínica */}
          <SettingsCard title="Clínica">
            <div className="flex flex-col gap-4">
              <form.Field name="name">
                {(field) => (
                  <Field
                    id="name"
                    label="Nome da clínica"
                    placeholder="Studio Forja"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    error={fieldError(field, serverErrors?.name)}
                  />
                )}
              </form.Field>

              <form.Field name="portalSubdomain">
                {(field) => {
                  const err = fieldError(field, serverErrors?.portalSubdomain);
                  return (
                    <div className="space-y-1.5">
                      <Label htmlFor="portalSubdomain">
                        Subdomínio do portal
                      </Label>
                      <div
                        className={cn(
                          "flex items-center rounded-[10px] border border-input bg-transparent px-3 text-sm focus-within:ring-2 focus-within:ring-ring/50",
                          err && "border-destructive",
                        )}
                      >
                        <span className="shrink-0 text-muted-foreground">
                          app.progresso.io/
                        </span>
                        <input
                          id="portalSubdomain"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) =>
                            field.handleChange(e.target.value)
                          }
                          placeholder="studio-forja"
                          aria-invalid={err ? true : undefined}
                          className="w-full bg-transparent py-2 outline-none placeholder:text-muted-foreground"
                        />
                      </div>
                      {err ? (
                        <p className="text-[13px] text-destructive">{err}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Opcional. Letras minúsculas, números e hífens.
                        </p>
                      )}
                    </div>
                  );
                }}
              </form.Field>
            </div>
          </SettingsCard>

          {/* Preferências de feedback */}
          <SettingsCard title="Preferências de feedback">
            <div className="flex flex-col gap-5">
              <form.Field name="feedbackFrequency">
                {(field) => (
                  <div>
                    <div className="mb-2 text-xs text-muted-foreground">
                      Frequência padrão de check-in dos alunos
                    </div>
                    <div className="flex flex-col gap-2">
                      {FEEDBACK_FREQUENCY_VALUES.map((value) => {
                        const active = field.state.value === value;
                        const meta = FEEDBACK_FREQUENCY_LABELS[value];
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => field.handleChange(value)}
                            className={cn(
                              "rounded-[10px] border px-4 py-3 text-left transition-colors",
                              active
                                ? "border-primary bg-primary-light"
                                : "border-border hover:bg-secondary",
                            )}
                          >
                            <div className="text-sm font-semibold text-foreground">
                              {meta.label}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {meta.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </form.Field>

              <form.Field name="feedbackPreferredDay">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label htmlFor="feedbackPreferredDay">Dia preferido</Label>
                    <Select
                      value={field.state.value}
                      onValueChange={(v) => field.handleChange(v as Weekday)}
                    >
                      <SelectTrigger
                        id="feedbackPreferredDay"
                        onBlur={field.handleBlur}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAY_VALUES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {WEEKDAY_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>

              <form.Field name="feedbackWhatsappReminder">
                {(field) => {
                  const on = field.state.value;
                  return (
                    <div className="space-y-1.5">
                      <Label htmlFor="feedbackWhatsappReminder">
                        Lembrete automático por WhatsApp
                      </Label>
                      <button
                        id="feedbackWhatsappReminder"
                        type="button"
                        role="switch"
                        aria-checked={on}
                        onClick={() => field.handleChange(!on)}
                        className="flex w-full items-center gap-3 rounded-[10px] border border-input px-3 py-2.5 text-left"
                      >
                        <span
                          className={cn(
                            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                            on ? "bg-primary" : "bg-input",
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 size-4 rounded-full bg-white transition-all",
                              on ? "right-0.5" : "left-0.5",
                            )}
                          />
                        </span>
                        <span className="text-sm text-[#475569]">
                          {on
                            ? "Ativo · envia 24h antes do check-in"
                            : "Inativo · sem lembrete automático"}
                        </span>
                      </button>
                    </div>
                  );
                }}
              </form.Field>
            </div>
          </SettingsCard>

          {/* WhatsApp Business — not built yet */}
          <SettingsCard title="WhatsApp Business">
            <ComingSoon />
          </SettingsCard>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Equipe de coaches — not built yet */}
          <SettingsCard title="Equipe de coaches">
            <ComingSoon />
          </SettingsCard>

          {/* Plano atual — real read from the clinic's plan */}
          <SettingsCard
            title="Plano atual"
            badge={
              <span className="rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-xs font-semibold text-[#047857]">
                ativo
              </span>
            }
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="font-heading text-2xl font-bold text-foreground">
                  {plan.name}
                </div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">
                  {plan.desc} · {plan.price}
                  {initial.plan === "free" || initial.plan === "enterprise"
                    ? ""
                    : " / mês"}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[13px]">
              <span className="text-muted-foreground">Cobrança e renovação</span>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Em breve
              </span>
            </div>
          </SettingsCard>
        </div>
      </div>
    </form>
  );
}

export default function ClinicSettingsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["coach-settings"],
    queryFn: () => apiFetch<ClinicSettingsDto>("/api/coach/settings"),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-5 font-heading text-2xl font-bold text-foreground sm:text-[28px]">
          Configurações
        </h1>
        <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Carregando…
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-5 font-heading text-2xl font-bold text-foreground sm:text-[28px]">
          Configurações
        </h1>
        <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-destructive shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {error instanceof Error
            ? error.message
            : "Não foi possível carregar as configurações."}
        </div>
      </div>
    );
  }

  return <ClinicSettingsForm initial={data} />;
}
