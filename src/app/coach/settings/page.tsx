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
  canUseBrandedPortal,
  clinicLogoUrl,
  clinicSettingsSchema,
  type ClinicSettingsDto,
  FEEDBACK_FREQUENCY_LABELS,
  FEEDBACK_FREQUENCY_VALUES,
  WEEKDAY_LABELS,
  WEEKDAY_VALUES,
} from "@/lib/clinic-settings";
import {
  formatBRL,
  formatCompetencia,
  formatDateBR,
  INVOICE_STATUS_LABELS,
  type InvoiceDto,
} from "@/lib/billing";
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

/**
 * Read-only "Faturas" card: the clinic's own invoices (managed by the platform
 * admin — the coach can see them but never edits them). Its own data island with
 * a separate query to the tenant-scoped `GET /api/coach/invoices`.
 */
function CoachInvoicesCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["coach-invoices"],
    queryFn: () =>
      apiFetch<{ invoices: InvoiceDto[] }>("/api/coach/invoices").then(
        (r) => r.invoices,
      ),
  });

  return (
    <SettingsCard title="Faturas">
      {isLoading && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Carregando…
        </p>
      )}
      {isError && (
        <p className="py-4 text-center text-sm text-destructive">
          Não foi possível carregar as faturas.
        </p>
      )}
      {data && data.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Nenhuma fatura por aqui ainda.
        </p>
      )}
      {data && data.length > 0 && (
        <ul className="divide-y divide-border">
          {data.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  #{inv.number} · {formatCompetencia(inv.competencia)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Vence {formatDateBR(inv.dueDate)}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-sm font-semibold text-foreground">
                  {formatBRL(inv.totalCents)}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    inv.status === "paid"
                      ? "text-[#047857]"
                      : inv.overdue
                        ? "text-destructive"
                        : "text-muted-foreground",
                  )}
                >
                  {inv.status === "pending" && inv.overdue
                    ? "Vencida"
                    : INVOICE_STATUS_LABELS[inv.status]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
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
  headline: string;
  description: string;
  whatsapp: string;
  instagram: string;
  siteUrl: string;
  accentColor: string;
  feedbackFrequency: FeedbackFrequency;
  feedbackPreferredDay: Weekday;
  feedbackWhatsappReminder: boolean;
};

function toValues(dto: ClinicSettingsDto): SettingsFormValues {
  return {
    name: dto.name,
    portalSubdomain: dto.portalSubdomain ?? "",
    headline: dto.headline ?? "",
    description: dto.description ?? "",
    whatsapp: dto.whatsapp ?? "",
    instagram: dto.instagram ?? "",
    siteUrl: dto.siteUrl ?? "",
    accentColor: dto.accentColor ?? "",
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

  // Logo upload is a separate multipart call (not part of the settings PUT). On
  // success we refetch so `hasLogo` + the preview update.
  const logoUpload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/coach/settings/logo", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error ?? "Falha ao enviar a imagem.");
      }
      return res.json() as Promise<{ hasLogo: boolean }>;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["coach-settings"] }),
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
  const branded = canUseBrandedPortal(initial.plan);
  const logoUploadError =
    logoUpload.error instanceof Error ? logoUpload.error.message : undefined;

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
          </SettingsCard>

          {/* Portal do aluno — branded microsite + login (paid feature). */}
          <SettingsCard
            title="Portal do aluno"
            badge={
              !branded ? (
                <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  Planos pagos
                </span>
              ) : undefined
            }
          >
            {!branded ? (
              <p className="py-2 text-[13px] text-muted-foreground">
                Publique um endereço com a sua marca —{" "}
                <span className="font-medium text-foreground">
                  app.progresso.io/sua-clinica
                </span>{" "}
                — com logo, descrição e uma tela de login personalizada para os
                seus alunos. Disponível a partir do plano Solo.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Logo */}
                <div className="space-y-1.5">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-3">
                    {initial.hasLogo && initial.portalSubdomain ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={clinicLogoUrl(initial.portalSubdomain)}
                        alt="Logo da clínica"
                        className="size-14 rounded-xl border border-border object-cover"
                      />
                    ) : (
                      <div className="flex size-14 items-center justify-center rounded-xl border border-dashed border-border text-lg font-bold text-muted-foreground">
                        {initial.name.trim().charAt(0).toUpperCase()}
                      </div>
                    )}
                    <label className="cursor-pointer">
                      <span className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-text-secondary shadow-sm hover:border-primary hover:text-primary">
                        {logoUpload.isPending ? "Enviando…" : "Enviar logo"}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={logoUpload.isPending}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) logoUpload.mutate(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {logoUploadError ? (
                    <p className="text-[13px] text-destructive">{logoUploadError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      JPG, PNG ou WEBP, até 5 MB. Salve um endereço para exibi-lo.
                    </p>
                  )}
                </div>

                {/* Slug */}
                <form.Field name="portalSubdomain">
                  {(field) => {
                    const err = fieldError(field, serverErrors?.portalSubdomain);
                    return (
                      <div className="space-y-1.5">
                        <Label htmlFor="portalSubdomain">Endereço do portal</Label>
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
                            onChange={(e) => field.handleChange(e.target.value)}
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

                {/* Headline */}
                <form.Field name="headline">
                  {(field) => (
                    <Field
                      id="headline"
                      label="Chamada"
                      placeholder="Treinamento e nutrição personalizados"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      error={fieldError(field, serverErrors?.headline)}
                    />
                  )}
                </form.Field>

                {/* Description */}
                <form.Field name="description">
                  {(field) => {
                    const err = fieldError(field, serverErrors?.description);
                    return (
                      <div className="space-y-1.5">
                        <Label htmlFor="description">Descrição</Label>
                        <textarea
                          id="description"
                          rows={3}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Uma breve apresentação da sua clínica."
                          aria-invalid={err ? true : undefined}
                          className={cn(
                            "w-full rounded-[10px] border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 placeholder:text-muted-foreground",
                            err && "border-destructive",
                          )}
                        />
                        {err ? (
                          <p className="text-[13px] text-destructive">{err}</p>
                        ) : null}
                      </div>
                    );
                  }}
                </form.Field>

                {/* Contacts */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <form.Field name="whatsapp">
                    {(field) => (
                      <Field
                        id="whatsapp"
                        label="WhatsApp"
                        placeholder="+55 11 99999-0000"
                        inputMode="tel"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        error={fieldError(field, serverErrors?.whatsapp)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="instagram">
                    {(field) => (
                      <Field
                        id="instagram"
                        label="Instagram"
                        placeholder="@suaclinica"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        error={fieldError(field, serverErrors?.instagram)}
                      />
                    )}
                  </form.Field>
                </div>

                <form.Field name="siteUrl">
                  {(field) => (
                    <Field
                      id="siteUrl"
                      label="Site"
                      placeholder="https://suaclinica.com.br"
                      inputMode="url"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      error={fieldError(field, serverErrors?.siteUrl)}
                    />
                  )}
                </form.Field>

                {/* Accent color */}
                <form.Field name="accentColor">
                  {(field) => {
                    const err = fieldError(field, serverErrors?.accentColor);
                    const value = field.state.value;
                    return (
                      <div className="space-y-1.5">
                        <Label htmlFor="accentColor">Cor de destaque</Label>
                        <div className="flex items-center gap-3">
                          <input
                            id="accentColor"
                            type="color"
                            value={value || "#16a34a"}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            className="size-9 cursor-pointer rounded-md border border-input bg-transparent p-1"
                          />
                          <span className="text-sm text-muted-foreground">
                            {value || "Cor padrão"}
                          </span>
                          {value ? (
                            <button
                              type="button"
                              onClick={() => field.handleChange("")}
                              className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
                            >
                              Remover
                            </button>
                          ) : null}
                        </div>
                        {err ? (
                          <p className="text-[13px] text-destructive">{err}</p>
                        ) : null}
                      </div>
                    );
                  }}
                </form.Field>
              </div>
            )}
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

          {/* Faturas — read-only ledger kept by the platform admin */}
          <CoachInvoicesCard />
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
