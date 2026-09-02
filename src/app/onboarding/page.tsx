"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StepIndicator } from "@/components/ui/step-indicator";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  ACCENT_PRESETS,
  FEEDBACK_FREQUENCY_LABELS,
  FEEDBACK_FREQUENCY_VALUES,
  WEEKDAY_LABELS,
  WEEKDAY_VALUES,
  type ClinicSettingsDto,
} from "@/lib/clinic-settings";
import {
  ONBOARDING_STEP_LABELS,
  STEP_DOMAIN,
  allSelected,
  onboardingSteps,
  selectableKeys,
  settingsChanges,
  toggleAll,
  type OnboardingStateDto,
  type SettingsChange,
  type StarterDomain,
} from "@/lib/onboarding";
import type { StarterItemDto, StarterSelectionInput } from "@/lib/starters";
import { cn } from "@/lib/utils";
import type { FeedbackFrequency, Weekday } from "@/db/schema";

/**
 * The setup guide — where a coach lands right after sign-up, and what
 * Configurações re-opens.
 *
 * It writes nothing new: the Modelos step posts to the starter-import endpoint,
 * the Feedback and Portal steps go through the same `PUT /api/coach/settings`
 * the settings screen uses, and each invite is a `POST /api/coach/team`. Every
 * step commits as it is passed, so closing the tab at step 3 keeps steps 1 and 2
 * — and every one of those endpoints validates with zod and derives the tenant
 * from the session, exactly as it does when the settings screen calls it.
 *
 * Skipping is a first-class exit, not a trap door: it stamps the same flag
 * finishing does, so a coach who said no is never asked again.
 */

/** The values the guide collects. Feedback + Portal are subsets of the settings DTO. */
type GuideValues = {
  feedbackFrequency: FeedbackFrequency;
  feedbackPreferredDay: Weekday;
  feedbackWhatsappReminder: boolean;
  portalSubdomain: string;
  headline: string;
  accentColor: string;
  invites: { name: string; email: string }[];
};

/** The full settings payload the PUT expects, rebuilt from the loaded DTO. */
function settingsPayload(dto: ClinicSettingsDto, values: GuideValues) {
  return {
    name: dto.name,
    portalSubdomain: values.portalSubdomain,
    headline: values.headline,
    description: dto.description ?? "",
    whatsapp: dto.whatsapp ?? "",
    instagram: dto.instagram ?? "",
    siteUrl: dto.siteUrl ?? "",
    accentColor: values.accentColor,
    feedbackFrequency: values.feedbackFrequency,
    feedbackPreferredDay: values.feedbackPreferredDay,
    feedbackWhatsappReminder: values.feedbackWhatsappReminder,
  };
}

export default function OnboardingPage() {
  const state = useQuery({
    queryKey: ["coach-onboarding"],
    queryFn: () => apiFetch<OnboardingStateDto>("/api/coach/onboarding"),
  });
  const settings = useQuery({
    queryKey: ["coach-settings"],
    queryFn: () => apiFetch<ClinicSettingsDto>("/api/coach/settings"),
  });

  if (state.isLoading || settings.isLoading) {
    return (
      <Shell>
        <p className="text-body text-muted-foreground">Carregando…</p>
      </Shell>
    );
  }

  if (!state.data || !settings.data) {
    return (
      <Shell>
        <p className="text-body text-destructive">
          Não foi possível carregar a configuração inicial.
        </p>
        <Button asChild variant="ghost" className="mt-4">
          <Link href="/coach">Ir para o painel</Link>
        </Button>
      </Shell>
    );
  }

  // Mounted only once both queries resolve: the form and the selection need the
  // loaded values as stable defaults, the same boundary the settings form draws.
  return <SetupGuide state={state.data} settings={settings.data} />;
}

/** The page frame: brand mark, centred column, nothing else to click. */
function Shell({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8 sm:px-6 sm:py-12">
      <Logo size={30} className="mb-8" />
      <div className={cn("w-full", wide ? "max-w-3xl" : "max-w-[560px]")}>
        {children}
      </div>
    </div>
  );
}

function SetupGuide({
  state,
  settings,
}: {
  state: OnboardingStateDto;
  settings: ClinicSettingsDto;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const steps = onboardingSteps(state);
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];

  /** A re-run: everything is already in place, so overwrites need confirming. */
  const isRerun = state.completedAt !== null;

  const [selection, setSelection] = useState(() => ({
    diets: new Set(state.catalog.diets.map((d) => d.key)),
    workouts: new Set(state.catalog.workouts.map((w) => w.key)),
    anamneses: new Set(state.catalog.anamneses.map((a) => a.key)),
  }));
  const [importedCount, setImportedCount] = useState(0);
  /** Whether a starter import has already happened for this clinic. */
  const [seeded, setSeeded] = useState(state.startersSeeded);
  const [sentInvites, setSentInvites] = useState<string[]>([]);
  const [pending, setPending] = useState<SettingsChange[] | null>(null);

  const form = useForm({
    defaultValues: {
      feedbackFrequency: settings.feedbackFrequency,
      feedbackPreferredDay: settings.feedbackPreferredDay,
      feedbackWhatsappReminder: settings.feedbackWhatsappReminder,
      portalSubdomain: settings.portalSubdomain ?? "",
      headline: settings.headline ?? "",
      accentColor: settings.accentColor ?? "",
      invites: [
        { name: "", email: "" },
        { name: "", email: "" },
      ],
    } satisfies GuideValues,
    onSubmit: async () => {
      /* Each step commits through its own handler below. */
    },
  });

  const importStarters = useMutation({
    mutationFn: (body: StarterSelectionInput) =>
      apiFetch<{
        imported: { diets: string[]; workouts: string[]; anamneses: string[] };
      }>("/api/clinic/starters/ensure", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });

  const saveSettings = useMutation({
    mutationFn: (values: GuideValues) =>
      apiFetch<ClinicSettingsDto>("/api/coach/settings", {
        method: "PUT",
        body: JSON.stringify(settingsPayload(settings, values)),
      }),
    onSuccess: (data) => queryClient.setQueryData(["coach-settings"], data),
  });

  const sendInvite = useMutation({
    mutationFn: (values: { name: string; email: string }) =>
      apiFetch<{ ok: boolean }>("/api/coach/team", {
        method: "POST",
        body: JSON.stringify(values),
      }),
  });

  const finish = useMutation({
    mutationFn: () =>
      apiFetch<{ completedAt: string }>("/api/coach/onboarding", {
        method: "POST",
        body: JSON.stringify({}),
      }),
  });

  const busy =
    importStarters.isPending ||
    saveSettings.isPending ||
    sendInvite.isPending ||
    finish.isPending;

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  /** Stamps the guide as done and leaves — the same call for finish and skip. */
  async function leave(to: string) {
    try {
      // Skipping before any import means the coach never got to choose, so they
      // leave with the whole library — the behaviour every clinic used to get
      // automatically. Skipping a re-run imports nothing: what is missing there
      // was left out on purpose.
      if (!seeded) await importStarters.mutateAsync({});
      await finish.mutateAsync();
    } catch {
      /* Surfaced below; the coach still gets out. */
    }
    queryClient.invalidateQueries({ queryKey: ["coach-onboarding"] });
    router.push(to);
  }

  /**
   * Imports one domain's ticked templates, then advances. Blocks on failure.
   *
   * The other two domains are sent as explicit empty arrays, never omitted: an
   * omitted domain means "all of it" (that is what skipping posts), so leaving
   * them out here would import the whole catalog from the Dietas step.
   */
  async function commitStarters(domain: StarterDomain) {
    const body: StarterSelectionInput = {
      diets: domain === "diets" ? [...selection.diets] : [],
      workouts: domain === "workouts" ? [...selection.workouts] : [],
      anamneses: domain === "anamneses" ? [...selection.anamneses] : [],
    };
    try {
      const result = await importStarters.mutateAsync(body);
      setImportedCount(
        (n) =>
          n +
          result.imported.diets.length +
          result.imported.workouts.length +
          result.imported.anamneses.length,
      );
      setSeeded(true);
      queryClient.invalidateQueries({ queryKey: ["coach-onboarding"] });
      goNext();
    } catch {
      /* Surfaced by the error banner — the step stays put so it can be retried. */
    }
  }

  /**
   * Saves the settings this step touched. On a re-run, anything it would
   * overwrite is confirmed first: a coach who came back to add one template
   * should not discover afterwards that it also moved their check-in day.
   */
  async function commitSettings() {
    const values = form.state.values;
    const changes = settingsChanges(settings, {
      feedbackFrequency: values.feedbackFrequency,
      feedbackPreferredDay: values.feedbackPreferredDay,
      feedbackWhatsappReminder: values.feedbackWhatsappReminder,
      portalSubdomain: values.portalSubdomain || null,
      headline: values.headline || null,
      accentColor: values.accentColor || null,
    });
    if (isRerun && changes.length > 0) {
      setPending(changes);
      return;
    }
    await applySettings();
  }

  async function applySettings() {
    try {
      await saveSettings.mutateAsync(form.state.values);
      setPending(null);
      goNext();
    } catch {
      setPending(null);
    }
  }

  /** Sends whichever invite rows were filled in, then advances. */
  async function commitEquipe() {
    const rows = form.state.values.invites.filter(
      (row) => row.name.trim() && row.email.trim(),
    );
    const sent: string[] = [];
    try {
      for (const row of rows) {
        await sendInvite.mutateAsync({
          name: row.name.trim(),
          email: row.email.trim(),
        });
        sent.push(row.email.trim());
      }
      setSentInvites(sent);
      goNext();
    } catch {
      // A partial send is real: keep what went out so the summary is honest and
      // a retry doesn't claim the failed row was invited.
      setSentInvites(sent);
    }
  }

  const error =
    importStarters.error ??
    saveSettings.error ??
    sendInvite.error ??
    finish.error;
  const banner = error instanceof ApiError ? error.message : undefined;
  const fieldErrors =
    error instanceof ApiError ? error.fieldErrors : undefined;

  /** The domain the current step chooses from, when it is a starter step. */
  const domain =
    step === "dietas" || step === "treinos" || step === "anamneses"
      ? STEP_DOMAIN[step]
      : null;

  return (
    <Shell wide={step === "dietas" || step === "treinos" || step === "anamneses"}>
      <StepIndicator
        labels={steps.map((s) => ONBOARDING_STEP_LABELS[s])}
        current={stepIndex + 1}
        className="mb-8 justify-center"
      />

      <div className="rounded-2xl bg-white px-6 py-7 shadow-rest sm:px-8">
        {banner ? (
          <div className="mb-5 rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
            {banner}
          </div>
        ) : null}

        {domain !== null && (
          <StarterStep
            key={domain}
            copy={STARTER_STEP_COPY[domain]}
            items={state.catalog[domain]}
            owned={state.owned[domain]}
            selected={selection[domain]}
            onChange={(next) =>
              setSelection((current) => ({ ...current, [domain]: next }))
            }
            busy={busy}
            label={importStarters.isPending ? "Importando…" : "Continuar"}
            onContinue={() => commitStarters(domain)}
            onBack={stepIndex > 0 ? () => setStepIndex((i) => i - 1) : undefined}
            onSkip={() => leave("/coach")}
          />
        )}

        {step === "feedback" && (
          <>
            <StepHeading
              title="Como você acompanha seus alunos"
              description="O padrão de check-in da clínica. Vale para todos os alunos novos e pode ser ajustado depois."
            />

            <div className="flex flex-col gap-5">
              <form.Field name="feedbackFrequency">
                {(field) => (
                  <div>
                    <div
                      id="frequency-label"
                      className="mb-2 text-label text-muted-foreground"
                    >
                      Frequência padrão de check-in
                    </div>
                    <div
                      role="radiogroup"
                      aria-labelledby="frequency-label"
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
                    <Label htmlFor="preferredDay">Dia preferido</Label>
                    <Select
                      value={field.state.value}
                      onValueChange={(v) => field.handleChange(v as Weekday)}
                    >
                      <SelectTrigger id="preferredDay">
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
                {(field) => (
                  <ToggleRow
                    id="whatsappReminder"
                    label="Lembrete automático por WhatsApp"
                    on={field.state.value}
                    onChange={() => field.handleChange(!field.state.value)}
                    onText="Ativo · envia 24h antes do check-in"
                    offText="Inativo · sem lembrete automático"
                  />
                )}
              </form.Field>
            </div>

            <StepActions
              busy={busy}
              label={saveSettings.isPending ? "Salvando…" : "Continuar"}
              onContinue={commitSettings}
              onBack={() => setStepIndex((i) => i - 1)}
              onSkip={() => leave("/coach")}
            />
          </>
        )}

        {step === "equipe" && (
          <>
            <StepHeading
              title="Convide sua equipe"
              description={`Seu plano inclui ${state.team.seatsAvailable === 1 ? "mais 1 coach" : `mais ${state.team.seatsAvailable} coaches`} além de você. Cada convite chega por e-mail e vale por alguns dias.`}
            />

            <div className="flex flex-col gap-5">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className="flex flex-col gap-3 rounded-[10px] border border-border px-4 py-4"
                >
                  <span className="text-label text-muted-foreground">
                    Coach {index + 1}
                    {index >= state.team.seatsAvailable
                      ? " · sem vaga no plano"
                      : " · opcional"}
                  </span>
                  <form.Field name={`invites[${index}].name`}>
                    {(field) => (
                      <Field
                        id={`invite-name-${index}`}
                        label="Nome"
                        placeholder="Nome do coach"
                        disabled={index >= state.team.seatsAvailable}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name={`invites[${index}].email`}>
                    {(field) => (
                      <Field
                        id={`invite-email-${index}`}
                        label="E-mail"
                        type="email"
                        placeholder="coach@email.com"
                        disabled={index >= state.team.seatsAvailable}
                        error={fieldErrors?.email}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    )}
                  </form.Field>
                </div>
              ))}
            </div>

            <StepActions
              busy={busy}
              label={sendInvite.isPending ? "Enviando…" : "Continuar"}
              onContinue={commitEquipe}
              onBack={() => setStepIndex((i) => i - 1)}
              onSkip={() => leave("/coach")}
            />
          </>
        )}

        {step === "portal" && (
          <>
            <StepHeading
              title="Deixe o portal com a sua cara"
              description="É o endereço que seus alunos abrem para ver treino, dieta e check-ins. Pode ficar para depois — nada aqui é obrigatório."
            />

            <div className="flex flex-col gap-5">
              <form.Field name="portalSubdomain">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label htmlFor="portalSubdomain">Endereço do portal</Label>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-body-dense text-muted-foreground">
                        app.progresso.io/
                      </span>
                      <Input
                        id="portalSubdomain"
                        placeholder="minha-clinica"
                        aria-invalid={
                          fieldErrors?.portalSubdomain ? true : undefined
                        }
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </div>
                    {fieldErrors?.portalSubdomain ? (
                      <p className="text-body-dense text-destructive">
                        {fieldErrors.portalSubdomain}
                      </p>
                    ) : null}
                  </div>
                )}
              </form.Field>

              <form.Field name="headline">
                {(field) => (
                  <Field
                    id="headline"
                    label="Chamada"
                    placeholder="Treinamento e nutrição personalizados"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                )}
              </form.Field>

              <form.Field name="accentColor">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label htmlFor="accentColor">Cor de destaque</Label>
                    <div>
                      {/* The same picker (and the same twelve swatches) as
                          Configurações — a coach who sets the colour here and
                          adjusts it there should meet one control, not two. */}
                      <ColorPicker
                        id="accentColor"
                        value={field.state.value}
                        onChange={(v) => field.handleChange(v)}
                        presets={ACCENT_PRESETS}
                      />
                    </div>
                    <p className="text-label text-muted-foreground">
                      Colore os botões e destaques do portal dos seus alunos. Sem
                      cor escolhida, usamos o verde padrão.
                    </p>
                    {fieldErrors?.accentColor ? (
                      <p className="text-body-dense text-destructive">
                        {fieldErrors.accentColor}
                      </p>
                    ) : null}
                  </div>
                )}
              </form.Field>

              <LogoUpload hasLogo={settings.hasLogo} />
            </div>

            <StepActions
              busy={busy}
              label={saveSettings.isPending ? "Salvando…" : "Continuar"}
              onContinue={commitSettings}
              onBack={() => setStepIndex((i) => i - 1)}
              onSkip={() => leave("/coach")}
            />
          </>
        )}

        {step === "pronto" && (
          <div className="text-center">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary-light">
              <Check className="size-7 text-primary" strokeWidth={2.5} />
            </span>
            <h1 className="mb-1 font-heading text-headline font-bold text-foreground">
              Tudo pronto
            </h1>
            <p className="mb-6 text-body text-muted-foreground">
              {summaryLine({
                imported: importedCount,
                frequency: form.state.values.feedbackFrequency,
                day: form.state.values.feedbackPreferredDay,
                invites: sentInvites.length,
              })}
            </p>

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                size="lg"
                disabled={busy}
                onClick={() => leave("/coach/students/new")}
              >
                Cadastrar meu primeiro aluno
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => leave("/coach")}
              >
                Ir para o painel
              </Button>
            </div>

            {state.upsellClinica ? (
              <p className="mt-6 border-t border-border pt-4 text-body-dense text-muted-foreground">
                Trabalha com outros coaches? O plano Clínica divide a mesma
                clínica com até 3 coaches.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* Re-run guard: nothing is overwritten before the coach sees exactly what
          changes. Templates are never in this list — the guide only adds them. */}
      <Dialog open={pending !== null} onOpenChange={() => setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar alterações</DialogTitle>
          </DialogHeader>
          <p className="text-body-dense text-muted-foreground">
            Isto vai substituir o que já está salvo:
          </p>
          <ul className="flex flex-col gap-2">
            {(pending ?? []).map((change) => (
              <li key={change.label} className="text-body-dense">
                <span className="font-medium text-foreground">
                  {change.label}
                </span>
                : {change.from} → {change.to}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPending(null)}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={busy} onClick={applySettings}>
              {saveSettings.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step furniture (each used by several steps)                                */
/* -------------------------------------------------------------------------- */

function StepHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="mb-1 font-heading text-headline font-bold text-foreground">
        {title}
      </h1>
      <p className="text-body-dense text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * The commit row every step wears. "Pular" is on every step on purpose: a coach
 * who wants out should not have to finish the flow to get out, and skipping
 * keeps whatever earlier steps already committed.
 */
function StepActions({
  busy,
  label,
  onContinue,
  onBack,
  onSkip,
}: {
  busy: boolean;
  label: string;
  onContinue: () => void;
  onBack?: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="mt-7 flex flex-col gap-3 border-t border-border pt-5">
      <div className="flex items-center gap-2">
        {onBack ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={onBack}>
            Voltar
          </Button>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="flex-1"
          disabled={busy}
          onClick={onContinue}
        >
          {label}
        </Button>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onSkip}
        className="text-body-dense text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
      >
        Pular e ir para o painel
      </button>
    </div>
  );
}

/**
 * How many templates one screen shows before "Ver mais".
 *
 * Thirteen diets is a wall of text to land on straight out of sign-up, and the
 * first decision a coach makes should fit on a phone without scrolling. Revealing
 * five at a time keeps every screen short while leaving the *choice* whole:
 * "selecionar todos" and the counter always mean the entire domain, never the
 * visible page.
 */
const PAGE_SIZE = 5;

/** Per-domain heading and blurb — the only thing that differs between the three. */
const STARTER_STEP_COPY: Record<
  StarterDomain,
  { title: string; description: string; empty: string }
> = {
  diets: {
    title: "Escolha suas dietas",
    description:
      "Planos alimentares prontos para atribuir e editar. Deixe marcados os que fizerem sentido — dá para importar o resto depois.",
    empty: "Todas as dietas prontas já estão na sua biblioteca.",
  },
  workouts: {
    title: "Escolha seus treinos",
    description:
      "Fichas completas por objetivo e nível. Elas viram cópias suas: edite à vontade depois de importar.",
    empty: "Todos os treinos prontos já estão na sua biblioteca.",
  },
  anamneses: {
    title: "Escolha suas anamneses",
    description:
      "Questionários de entrada por objetivo e modalidade. O aluno responde pelo link e você recebe tudo no perfil dele.",
    empty: "Todas as anamneses prontas já estão na sua biblioteca.",
  },
};

/**
 * One starter domain: a checklist, a counter, and the step's own commit row.
 *
 * Used by all three starter steps, which is the whole reason it is a component
 * rather than inline markup.
 */
function StarterStep({
  copy,
  items,
  owned,
  selected,
  onChange,
  busy,
  label,
  onContinue,
  onBack,
  onSkip,
}: {
  copy: { title: string; description: string; empty: string };
  items: StarterItemDto[];
  owned: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  busy: boolean;
  label: string;
  onContinue: () => void;
  onBack?: () => void;
  onSkip: () => void;
}) {
  const selectable = selectableKeys(items, owned);
  const all = allSelected(items, owned, selected);
  const chosen = items.filter(
    (item) => owned.includes(item.key) || selected.has(item.key),
  ).length;

  // Reveal, not paging: what is already on screen stays there. Paging would move
  // a coach away from rows they just ticked, and there is no reason to hide a
  // decision they have made. Reset per domain by the `key` at the call site.
  const [shown, setShown] = useState(PAGE_SIZE);
  const visible = items.slice(0, shown);
  const remaining = items.length - visible.length;

  return (
    <>
      <StepHeading title={copy.title} description={copy.description} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-body-dense text-muted-foreground">
          {remaining > 0 ? `${visible.length} de ${items.length} mostradas · ` : ""}
          {chosen} selecionados
        </span>
        {/* Hidden when nothing is selectable: on a clinic that already holds
            every template, a "limpar seleção" that cannot clear anything (owned
            templates are never removed) is a button that reads as broken. */}
        {selectable.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(toggleAll(items, owned, !all))}
          >
            {all ? "Limpar seleção" : "Selecionar todos"}
          </Button>
        ) : (
          <span className="text-body-dense text-meta">{copy.empty}</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {visible.map((item) => {
          const isOwned = owned.includes(item.key);
          const checked = isOwned || selected.has(item.key);
          return (
            <button
              key={item.key}
              type="button"
              role="checkbox"
              aria-checked={checked}
              aria-disabled={isOwned || undefined}
              onClick={() => {
                if (!isOwned) onChange(toggle(selected, item.key));
              }}
              className={cn(
                "flex items-start gap-3 rounded-[10px] border px-4 py-3 text-left transition-colors",
                checked
                  ? "border-primary bg-primary-light"
                  : "border-border hover:bg-secondary",
                isOwned && "cursor-default opacity-70",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]",
                  checked
                    ? "border-primary bg-primary text-white"
                    : "border-input bg-white",
                )}
              >
                {checked ? <Check className="size-3" strokeWidth={3.5} /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-body font-semibold text-foreground">
                  {item.name}
                </span>
                {item.description ? (
                  <span className="mt-0.5 block text-body-dense text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
                <span className="mt-1 block text-label text-meta">
                  {isOwned ? `já na sua biblioteca · ${item.hint}` : item.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {remaining > 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
          >
            Ver mais {Math.min(PAGE_SIZE, remaining)}
          </Button>
          {/* Decorative: how much of the domain is on screen. The counter above
              says it in words, which is what a screen reader gets. */}
          <span aria-hidden className="flex items-center gap-1.5">
            {Array.from({
              length: Math.ceil(items.length / PAGE_SIZE),
            }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "size-1.5 rounded-full",
                  i < Math.ceil(visible.length / PAGE_SIZE)
                    ? "bg-primary"
                    : "bg-border",
                )}
              />
            ))}
          </span>
        </div>
      ) : null}

      <StepActions
        busy={busy}
        label={label}
        onContinue={onContinue}
        onBack={onBack}
        onSkip={onSkip}
      />
    </>
  );
}

/** The switch row, shaped like the one on the settings screen. */
function ToggleRow({
  id,
  label,
  on,
  onChange,
  onText,
  offText,
}: {
  id: string;
  label: string;
  on: boolean;
  onChange: () => void;
  onText: string;
  offText: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onChange}
        className="flex min-h-11 w-full items-center gap-3 rounded-[10px] border-[1.5px] border-input px-3 py-2.5 text-left transition-colors hover:border-primary"
      >
        <span
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
            on ? "bg-primary" : "bg-input",
          )}
        >
          <span
            className={cn(
              "absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition-transform motion-reduce:transition-none",
              on ? "translate-x-4" : "translate-x-0",
            )}
          />
        </span>
        <span className="text-body text-text-secondary">
          {on ? onText : offText}
        </span>
      </button>
    </div>
  );
}

/**
 * The logo is a multipart upload to its own route, not part of the settings PUT
 * — so it commits the moment a file is chosen, exactly as the settings screen
 * does it.
 */
function LogoUpload({ hasLogo }: { hasLogo: boolean }) {
  const queryClient = useQueryClient();
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/coach/settings/logo", { method: "POST", body });
      if (!res.ok) {
        const message = await res.json().catch(() => null);
        throw new Error(message?.error ?? "Falha ao enviar a imagem.");
      }
      return res.json() as Promise<{ hasLogo: boolean }>;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["coach-settings"] }),
  });

  const done = upload.isSuccess || hasLogo;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="logo">Logo</Label>
      <Input
        id="logo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={upload.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
        }}
      />
      <p
        className={cn(
          "text-body-dense",
          upload.error ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {upload.error instanceof Error
          ? upload.error.message
          : upload.isPending
            ? "Enviando…"
            : done
              ? "Logo enviada."
              : "JPG, PNG ou WEBP até 5 MB. Opcional."}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Toggles one key in a selection set (sets are replaced, never mutated). */
function toggle(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}

/** The "Tudo pronto" line: what actually landed, in the coach's words. */
function summaryLine(input: {
  imported: number;
  frequency: FeedbackFrequency;
  day: Weekday;
  invites: number;
}): string {
  const parts = [
    input.imported === 1
      ? "1 modelo importado"
      : `${input.imported} modelos importados`,
    `check-in ${FEEDBACK_FREQUENCY_LABELS[input.frequency].label.toLowerCase()} · ${WEEKDAY_LABELS[input.day].toLowerCase()}`,
  ];
  if (input.invites > 0) {
    parts.push(
      input.invites === 1 ? "1 convite enviado" : `${input.invites} convites enviados`,
    );
  }
  return parts.join(" · ");
}
