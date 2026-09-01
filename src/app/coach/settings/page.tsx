"use client";

import { useEffect, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Trash2, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  coachInviteSchema,
  type CoachRowDto,
  type CoachTeamResponse,
  type PendingInviteDto,
} from "@/lib/coaches";
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
import { avatarPalette } from "@/lib/students";
import {
  formatUsage,
  isAtLimit,
  PLAN_META,
  type PlanUsageDto,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * Clinic configuration ("Configurações"). Client page → GET/PUT
 * /api/coach/settings via TanStack Query, per the frontend rules. Clínica,
 * Portal do aluno and Preferências de feedback are editable; Equipe de coaches
 * is the owner's team management on team-capable plans (hidden otherwise); Plano
 * atual + Faturas read the clinic's real plan/invoices. Nothing here renders a
 * placeholder: a card whose whole content was "Em breve" told the coach less
 * than its absence does, and one of them contradicted the Pix flow the billing
 * banner already offers.
 */

/**
 * A curated set of modern accent tones (Tailwind 600-ish) offered as swatches,
 * so the coach picks a tasteful brand color without the raw OS color dialog. A
 * custom picker still covers anything off-palette.
 */
const ACCENT_PRESETS = [
  "#16a34a", // green
  "#059669", // emerald
  "#0d9488", // teal
  "#0ea5e9", // sky
  "#2563eb", // blue
  "#4f46e5", // indigo
  "#7c3aed", // violet
  "#db2777", // pink
  "#e11d48", // rose
  "#ea580c", // orange
  "#d97706", // amber
  "#0f172a", // slate
] as const;

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
    <section className="rounded-2xl bg-white p-5 shadow-rest sm:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <h2 className="font-heading text-subtitle font-semibold text-foreground">
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
        <p className="py-4 text-center text-body text-muted-foreground">
          Carregando…
        </p>
      )}
      {isError && (
        <p className="py-4 text-center text-body text-destructive">
          Não foi possível carregar as faturas.
        </p>
      )}
      {data && data.length === 0 && (
        <p className="py-4 text-center text-body text-muted-foreground">
          Nenhuma fatura por aqui ainda.
        </p>
      )}
      {data && data.length > 0 && (
        <ul className="divide-y divide-border">
          {data.map((inv) => (
            <li key={inv.id}>
              {/* A row that opens a PDF has to look like one: the old version
                  announced itself only through a `title` attribute, which a
                  pointer never sees and a phone cannot hover. */}
              <a
                href={`/api/coach/invoices/${inv.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-between gap-3 rounded-[10px] px-1 py-2.5 transition-colors hover:bg-surface-light"
              >
                <div className="min-w-0">
                  <span className="flex items-center gap-1.5 text-body font-medium text-foreground">
                    #{inv.number} · {formatCompetencia(inv.competencia)}
                    <FileText className="size-3.5 shrink-0 text-meta" />
                    <span className="sr-only">(abre o PDF em outra aba)</span>
                  </span>
                  <div className="text-label text-muted-foreground">
                    Vence {formatDateBR(inv.dueDate)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-body font-semibold text-foreground">
                    {formatBRL(inv.totalCents)}
                  </span>
                  {/* `--danger-fg`, not `--destructive`: this ships at 12px,
                      where the pure pigment reads 3.76:1 on Paper. */}
                  <span
                    className={cn(
                      "text-label font-medium",
                      inv.status === "paid"
                        ? "text-primary-deep"
                        : inv.overdue
                          ? "text-danger-fg"
                          : "text-muted-foreground",
                    )}
                  >
                    {inv.status === "pending" && inv.overdue
                      ? "Vencida"
                      : INVOICE_STATUS_LABELS[inv.status]}
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}

/**
 * Circular initials avatar shared by coach + pending rows.
 *
 * The tint comes from `AVATAR_PALETTE` — the same wash/ink set the roster hashes
 * an aluno's id into, guarded by a unit test and deliberately free of emerald,
 * red and amber so an avatar never borrows a pigment that means "alive",
 * "wrong" or "overdue". This card used to declare a second, saturated palette
 * of its own, which put a violet fill next to the coach's violet accent swatch
 * next to emerald chrome — three chromatic voices where the system allows one.
 * The wash/ink pairs also fix the pending-invite avatar, which read at 2.02:1.
 */
function Avatar({ id, initials }: { id: string; initials: string }) {
  const tint = avatarPalette(id);
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-body font-semibold"
      style={{ backgroundColor: tint.bg, color: tint.fg }}
    >
      {initials}
    </span>
  );
}

/** The invite dialog — owner adds a coach by name + e-mail (TanStack Form). */
function InviteCoachDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
}) {
  const invite = useMutation({
    mutationFn: (values: { name: string; email: string }) =>
      apiFetch<{ ok: boolean }>("/api/coach/team", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      onInvited();
      onOpenChange(false);
    },
  });

  const form = useForm({
    defaultValues: { name: "", email: "" },
    validators: { onChange: coachInviteSchema },
    onSubmit: async ({ value, formApi }) => {
      try {
        await invite.mutateAsync(value);
        formApi.reset();
      } catch {
        /* surfaced via invite.error */
      }
    },
  });

  const serverErrors =
    invite.error instanceof ApiError ? invite.error.fieldErrors : undefined;
  const banner =
    invite.error instanceof ApiError && !invite.error.fieldErrors
      ? invite.error.message
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar coach</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          {banner ? (
            <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
              {banner}
            </div>
          ) : null}
          <form.Field name="name">
            {(field) => (
              <Field
                id="coach-name"
                label="Nome"
                placeholder="Nome do coach"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                error={fieldError(field, serverErrors?.name)}
              />
            )}
          </form.Field>
          <form.Field name="email">
            {(field) => (
              <Field
                id="coach-email"
                label="E-mail"
                type="email"
                placeholder="coach@email.com"
                autoComplete="off"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                error={fieldError(field, serverErrors?.email)}
              />
            )}
          </form.Field>
          <p className="text-label text-muted-foreground">
            Enviaremos um convite por e-mail para o coach definir a senha e
            acessar a clínica.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? "Enviando…" : "Enviar convite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Confirm-and-remove dialog for an active coach (alunos move to the owner). */
function RemoveCoachDialog({
  coach,
  onOpenChange,
  onRemoved,
}: {
  coach: CoachRowDto | null;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => void;
}) {
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/coach/team/coaches/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      onRemoved();
      onOpenChange(false);
    },
  });

  const error = remove.error instanceof ApiError ? remove.error.message : undefined;

  return (
    <Dialog open={coach !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover coach</DialogTitle>
        </DialogHeader>
        {coach ? (
          <div className="space-y-4">
            <p className="text-body text-muted-foreground">
              Remover <span className="font-medium text-foreground">{coach.name}</span> da
              equipe? Os {coach.studentCount} alunos deste coach passam para o
              responsável pela clínica, e o acesso dele é encerrado.
            </p>
            {error ? (
              <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
                {error}
              </div>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(coach.id)}
              >
                {remove.isPending ? "Removendo…" : "Remover"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Equipe de coaches" — the owner's team-management card (its own data island,
 * like Faturas). Renders nothing unless the API says the surface is enabled
 * (owner on a team-capable plan). Lists coaches with their aluno load, pending
 * invites, and free seats, and drives invite/remove/cancel.
 */
function CoachTeamCard() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<CoachRowDto | null>(null);

  const { data } = useQuery({
    queryKey: ["coach-team"],
    queryFn: () => apiFetch<CoachTeamResponse>("/api/coach/team"),
  });

  const cancelInvite = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/coach/team/invites/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => refresh(),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["coach-team"] });
  }

  // Hidden entirely for non-owners / plans without a team surface.
  if (!data || !data.enabled) return null;
  const team = data.team;

  const emptySeats =
    team.maxCoaches === null
      ? 0
      : Math.max(0, team.maxCoaches - team.seatsUsed);

  return (
    <SettingsCard
      title="Equipe de coaches"
      badge={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-11 gap-1.5 px-2.5 text-primary-deep sm:h-9"
          disabled={!team.canInvite}
          onClick={() => setInviteOpen(true)}
        >
          <UserPlus className="size-4" />
          Convidar
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        {team.coaches.map((c) => (
          <CoachRow
            key={c.id}
            coach={c}
            onRemove={c.isOwner ? undefined : () => setRemoving(c)}
          />
        ))}

        {team.pendingInvites.map((p) => (
          <PendingRow
            key={p.id}
            invite={p}
            onCancel={() => cancelInvite.mutate(p.id)}
            canceling={cancelInvite.isPending}
          />
        ))}

        {Array.from({ length: emptySeats }).map((_, i) => (
          <div
            key={`vaga-${i}`}
            className="flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-body font-semibold text-muted-foreground">
              ?
            </span>
            <span className="text-body font-medium text-muted-foreground">
              — vaga livre
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 border-t border-border pt-3 text-center text-body-dense text-muted-foreground">
        Plano {team.planName} ·{" "}
        {team.maxCoaches === null
          ? "vagas ilimitadas"
          : `${team.maxCoaches} ${team.maxCoaches === 1 ? "vaga" : "vagas"}`}{" "}
        · {team.occupied} {team.occupied === 1 ? "ocupada" : "ocupadas"}
        {team.pendingCount > 0
          ? ` · ${team.pendingCount} pendente${team.pendingCount === 1 ? "" : "s"}`
          : ""}
      </p>

      <InviteCoachDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={refresh}
      />
      <RemoveCoachDialog
        coach={removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        onRemoved={refresh}
      />
    </SettingsCard>
  );
}

/** One accepted coach: avatar, name, role label, aluno count, optional remove. */
function CoachRow({
  coach,
  onRemove,
}: {
  coach: CoachRowDto;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5">
      <Avatar id={coach.id} initials={coach.initials} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-semibold text-foreground">
          {coach.name}
        </div>
        <div className="text-label text-muted-foreground">
          {coach.isOwner ? "Admin · Coach" : "Coach"}
        </div>
      </div>
      <span className="shrink-0 text-body text-muted-foreground">
        {coach.studentCount} {coach.studentCount === 1 ? "aluno" : "alunos"}
      </span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remover ${coach.name}`}
          onClick={onRemove}
          className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:size-9"
        >
          <Trash2 className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/** One pending invite: muted slot with the invitee + a cancel control. */
function PendingRow({
  invite,
  onCancel,
  canceling,
}: {
  invite: PendingInviteDto;
  onCancel: () => void;
  canceling: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-secondary/60 px-3 py-2.5">
      <Avatar id={invite.id} initials={invite.initials} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-semibold text-foreground">
          {invite.name}
        </div>
        <div className="truncate text-label text-muted-foreground">
          convite pendente · {invite.email}
        </div>
      </div>
      <button
        type="button"
        aria-label={`Cancelar convite de ${invite.name}`}
        onClick={onCancel}
        disabled={canceling}
        className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 sm:size-9"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/**
 * Plan usage vs. caps for the "Plano atual" card — active alunos, coaches, and
 * whether WhatsApp is included. Shares the `coach-plan-usage` query with the
 * roster chip + dashboard tile.
 */
function PlanUsageRows() {
  const { data } = useQuery({
    queryKey: ["coach-plan-usage"],
    queryFn: () => apiFetch<PlanUsageDto>("/api/coach/plan-usage"),
  });
  if (!data) return null;

  const counters = [
    { label: "Alunos", counter: data.students },
    { label: "Coaches", counter: data.coaches },
  ];

  return (
    <div className="mt-4 space-y-2 border-t border-border pt-3 text-body-dense">
      {counters.map(({ label, counter }) => (
        <div key={label} className="flex items-center justify-between">
          <span className="text-muted-foreground">{label}</span>
          <span
            className={cn(
              "font-medium",
              isAtLimit(counter.used, counter.limit)
                ? "text-destructive"
                : "text-foreground",
            )}
          >
            {formatUsage(counter.used, counter.limit)}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">WhatsApp</span>
        <span
          className={cn(
            "font-medium",
            data.whatsapp ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {data.whatsapp ? "Incluído" : "Não incluído"}
        </span>
      </div>
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

  const isDirty = useStore(form.store, (state) => state.isDirty);

  // These controls set the check-in cadence for every aluno in the clinic, and
  // used to vanish without a word on a reload or an accidental back. The
  // anamnese builder has guarded its draft for a while; this is the same guard.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

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
        <h1 className="font-heading text-headline font-bold text-foreground">
          Configurações
        </h1>
        {/* From lg up the whole form is roughly one screen and the commit can
            live here. Below that it is ~2900px of scroll, so the action moves
            to the sticky bar at the foot of the page — a Salvar the coach has
            to scroll 2700px to reach is a Salvar they do not press. */}
        <div className="hidden items-center gap-3 lg:flex">
          {mutation.isSuccess && !isDirty ? (
            <span className="flex items-center gap-1 text-body-dense font-medium text-primary-deep">
              <Check className="size-4" />
              Salvo
            </span>
          ) : null}
          <Button type="submit" disabled={mutation.isPending || !isDirty}>
            {mutation.isPending ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>

      {banner ? (
        <div className="mb-4 rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
          {banner}
        </div>
      ) : null}

      {/* `min-w-0` on both columns is load-bearing, not decoration: a grid item
          defaults to `min-width: auto`, so without it the widest content in
          either column sets that column's floor and the whole page scrolls
          sideways on a phone. See DESIGN.md, The min-w-0 Rule. */}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* Left column */}
        <div className="flex min-w-0 flex-col gap-4">
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
                <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-caption font-semibold text-muted-foreground">
                  Planos pagos
                </span>
              ) : undefined
            }
          >
            {!branded ? (
              <p className="py-2 text-body-dense text-muted-foreground">
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
                      <div className="flex size-14 items-center justify-center rounded-xl border border-dashed border-border font-heading text-title font-bold text-muted-foreground">
                        {initial.name.trim().charAt(0).toUpperCase()}
                      </div>
                    )}
                    {/* `sr-only`, not `hidden`: `display:none` takes the input
                        out of the tab order, and the <span> beside it is not
                        focusable — which left the logo upload with no keyboard
                        path at all. The span mirrors the input's focus with
                        `focus-within`. */}
                    <label className="cursor-pointer">
                      {/* The input comes first so `peer-focus-visible` can
                          reach the span — Tailwind's peer utilities use a
                          following-sibling combinator. */}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="peer sr-only"
                        disabled={logoUpload.isPending}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) logoUpload.mutate(file);
                          e.target.value = "";
                        }}
                      />
                      <span className="inline-flex h-11 items-center rounded-[10px] border-[1.5px] border-input bg-background px-4 text-body font-medium text-text-secondary shadow-sm transition-colors hover:border-primary hover:text-primary peer-focus-visible:border-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-primary/15 sm:h-10">
                        {logoUpload.isPending ? "Enviando…" : "Enviar logo"}
                      </span>
                    </label>
                  </div>
                  {logoUploadError ? (
                    <p className="text-body-dense text-destructive">{logoUploadError}</p>
                  ) : (
                    <p className="text-label text-muted-foreground">
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
                        {/* Kept hand-rolled only for the `app.progresso.io/`
                            affix, which the shared Input cannot carry — but it
                            now wears the system's interactive stroke (1.5px)
                            and its two-signal focus (emerald border + a 3px
                            halo) instead of a 1px box and a grey ring. */}
                        <div
                          className={cn(
                            "flex h-11 min-w-0 items-center rounded-[10px] border-[1.5px] border-input bg-background px-3.5 text-body transition-colors focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15",
                            err &&
                              "border-destructive focus-within:border-destructive focus-within:ring-destructive/15",
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
                            aria-describedby={
                              err ? "portalSubdomain-error" : undefined
                            }
                            className="h-full w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground"
                          />
                        </div>
                        {err ? (
                          <p
                            id="portalSubdomain-error"
                            className="text-body-dense text-destructive"
                          >
                            {err}
                          </p>
                        ) : (
                          <p className="text-label text-muted-foreground">
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
                        <Textarea
                          id="description"
                          rows={3}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Uma breve apresentação da sua clínica."
                          aria-invalid={err ? true : undefined}
                          aria-describedby={err ? "description-error" : undefined}
                        />
                        {err ? (
                          <p
                            id="description-error"
                            className="text-body-dense text-destructive"
                          >
                            {err}
                          </p>
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
                    return (
                      <div className="space-y-1.5">
                        <Label htmlFor="accentColor">Cor de destaque</Label>
                        <div>
                          <ColorPicker
                            id="accentColor"
                            value={field.state.value}
                            onChange={(v) => field.handleChange(v)}
                            presets={ACCENT_PRESETS}
                          />
                        </div>
                        <p className="text-label text-muted-foreground">
                          Colore os botões e destaques do seu portal público
                          (app.progresso.io/{initial.portalSubdomain || "sua-clinica"}).
                          Sem cor escolhida, usamos o verde padrão.
                        </p>
                        {err ? (
                          <p className="text-body-dense text-destructive">{err}</p>
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
                    <div
                      id="feedbackFrequency-label"
                      className="mb-2 text-label text-muted-foreground"
                    >
                      Frequência padrão de check-in dos alunos
                    </div>
                    <div
                      role="radiogroup"
                      aria-labelledby="feedbackFrequency-label"
                      className="flex flex-col gap-2"
                    >
                      {FEEDBACK_FREQUENCY_VALUES.map((value) => {
                        const active = field.state.value === value;
                        const meta = FEEDBACK_FREQUENCY_LABELS[value];
                        return (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => field.handleChange(value)}
                            className={cn(
                              "rounded-[10px] border px-4 py-3 text-left transition-colors",
                              active
                                ? "border-primary bg-primary-light"
                                : "border-border hover:bg-secondary",
                            )}
                          >
                            <div className="text-body font-semibold text-foreground">
                              {meta.label}
                            </div>
                            <div className="mt-0.5 text-label text-muted-foreground">
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
                        className="flex min-h-11 w-full items-center gap-3 rounded-[10px] border-[1.5px] border-input px-3 py-2.5 text-left transition-colors hover:border-primary"
                      >
                        <span
                          className={cn(
                            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                            on ? "bg-primary" : "bg-input",
                          )}
                        >
                          {/* The knob's position IS the state, which is the one
                              kind of movement the Stillness Rule allows — the
                              same licence the spinner has. Scoped to
                              `transform`, though: `transition-all` animated
                              every property at once and was one of the two
                              places in the codebase still doing that. */}
                          <span
                            className={cn(
                              "absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition-transform motion-reduce:transition-none",
                              on ? "translate-x-4" : "translate-x-0",
                            )}
                          />
                        </span>
                        <span className="text-body text-text-secondary">
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
        </div>

        {/* Right column */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Equipe de coaches — owner-only, on team-capable plans (hides itself
              otherwise). Its own data island → GET/POST /api/coach/team. */}
          <CoachTeamCard />

          {/* Plano atual — real read from the clinic's plan */}
          <SettingsCard title="Plano atual">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="font-heading text-headline font-bold text-foreground">
                  {plan.name}
                </div>
                <div className="mt-0.5 text-body-dense text-muted-foreground">
                  {plan.desc} · {plan.price}
                  {initial.plan === "free" || initial.plan === "enterprise"
                    ? ""
                    : " / mês"}
                </div>
              </div>
            </div>
            <PlanUsageRows />
            <p className="mt-4 border-t border-border pt-3 text-body-dense text-muted-foreground">
              A cobrança é por Pix, contra a fatura do mês. As suas faturas
              ficam logo abaixo.
            </p>
          </SettingsCard>

          {/* Faturas — read-only ledger kept by the platform admin */}
          <CoachInvoicesCard />
        </div>
      </div>

      {/* The commit, where the work is. Below lg this page is ~2900px of scroll
          and the header's Salvar is off-screen for all but the first card, so
          the bar rides the bottom of the viewport and appears only when there
          is something to commit. It carries the confirmation too — a "Salvo"
          2700px above where the coach is looking is a confirmation nobody
          receives. `bottom-0` + the upward Overlay shadow, per DESIGN.md. */}
      {(isDirty || mutation.isSuccess || mutation.isPending) && (
        <div
          role="status"
          className="sticky bottom-0 z-20 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-border bg-white px-4 py-3 shadow-overlay-up sm:-mx-6 sm:px-6 lg:hidden"
        >
          {/* Terse on purpose: at 390px the two buttons leave ~90px, and
              "Alterações não salvas" wrapped to two lines and grew the bar. */}
          {isDirty ? (
            <span className="min-w-0 text-body-dense text-muted-foreground">
              Não salvo
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-1 text-body-dense font-medium text-primary-deep">
              <Check className="size-4 shrink-0" />
              Salvo
            </span>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {isDirty && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => form.reset()}
                disabled={mutation.isPending}
              >
                Descartar
              </Button>
            )}
            <Button type="submit" disabled={mutation.isPending || !isDirty}>
              {mutation.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </div>
      )}
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
        <h1 className="mb-5 font-heading text-headline font-bold text-foreground">
          Configurações
        </h1>
        <div className="rounded-2xl bg-white p-6 text-center text-body text-muted-foreground shadow-rest">
          Carregando…
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-5 font-heading text-headline font-bold text-foreground">
          Configurações
        </h1>
        <div className="rounded-2xl bg-white p-6 text-center text-body text-destructive shadow-rest">
          {error instanceof Error
            ? error.message
            : "Não foi possível carregar as configurações."}
        </div>
      </div>
    );
  }

  return <ClinicSettingsForm initial={data} />;
}
