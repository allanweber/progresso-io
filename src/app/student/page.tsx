"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  ChevronRight,
  Dumbbell,
  LineChart,
  ListChecks,
  Loader2,
  LogOut,
  Repeat,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  X,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { MacroSummary } from "@/components/diets/diet-detail-view";
import {
  WorkoutExerciseDetail,
  WorkoutSessionsView,
  type GroupInfo,
} from "@/components/workouts/workout-detail-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, ApiError } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import {
  formatGrams,
  formatKcal,
  type DietFoodSubstituteDto,
  type DietMacrosDto,
} from "@/lib/diets";
import type {
  StudentDietVersionDto,
  TreeItem,
  TreeMeal,
} from "@/lib/student-diets";
import type { StudentWorkoutVersionDto } from "@/lib/student-workouts";
import type { WorkoutExerciseDto } from "@/lib/workouts";
import type {
  AlunoProfileDto,
  MyDietStateDto,
  MyWorkoutStateDto,
} from "@/lib/student-portal";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fieldError } from "@/lib/form";
import { compressImage } from "@/lib/image-compression";
import {
  CHECKIN_POSE_INSTRUCTIONS,
  CHECKIN_POSE_LABELS,
  CHECKIN_POSE_VALUES,
  checkinSubmitSchema,
  type CheckinDto,
  type CheckinListDto,
  type WeightPointDto,
} from "@/lib/student-checkins";
import type { CheckinPose } from "@/db/schema";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Tabs                                                                        */
/* -------------------------------------------------------------------------- */

type TabId = "treino" | "dieta" | "checkin" | "evolucao";

const TABS: {
  id: TabId;
  label: string;
  icon: typeof Dumbbell;
}[] = [
  { id: "treino", label: "Treino", icon: Dumbbell },
  { id: "dieta", label: "Dieta", icon: UtensilsCrossed },
  { id: "checkin", label: "Check-in", icon: ListChecks },
  { id: "evolucao", label: "Evolução", icon: LineChart },
];

/* -------------------------------------------------------------------------- */
/*  Small display helpers                                                       */
/* -------------------------------------------------------------------------- */

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

/** "2 unidade" (+ "100 g" as a sub) when a measure was used, else "100 g". */
function quantity(
  grams: number,
  measureLabel: string | null,
  measureGrams: number | null,
): { main: string; sub: string | null } {
  if (measureLabel && measureGrams && measureGrams > 0) {
    const count = Math.round(grams / measureGrams);
    return { main: `${count} ${measureLabel}`, sub: formatGrams(grams) };
  }
  return { main: formatGrams(grams), sub: null };
}

/** Proteína / carbo / gordura proportions, as bar segments. */
function macroRatio(m: DietMacrosDto): { color: string; pct: number }[] {
  const p = m.protein ?? 0;
  const c = m.carbohydrate ?? 0;
  const g = m.fat ?? 0;
  const tot = p + c + g || 1;
  return [
    { color: "bg-blue-600", pct: (p / tot) * 100 },
    { color: "bg-red-600", pct: (c / tot) * 100 },
    { color: "bg-amber-600", pct: (g / tot) * 100 },
  ];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

/**
 * The food's catalog substitutes not already listed as a coach equivalence
 * (deduped by food), each scaled to the item's portion (catalog grams are per
 * 100 g of the item's food).
 */
function catalogSubs(
  item: TreeItem,
): { foodId: string; description: string; grams: number }[] {
  const added = new Set(item.substitutes.map((s) => s.foodId));
  return (item.foodSubstitutes ?? [])
    .filter((s: DietFoodSubstituteDto) => !added.has(s.foodId))
    .map((s: DietFoodSubstituteDto) => ({
      foodId: s.foodId,
      description: s.description,
      grams: Math.round((item.grams / 100) * s.grams),
    }));
}

/** How many distinct swaps a food offers (coach equivalences + catalog). */
function subCount(item: TreeItem): number {
  return item.substitutes.length + catalogSubs(item).length;
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function StudentPortalPage() {
  const [tab, setTab] = useState<TabId>("dieta");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  const profile = useQuery({
    queryKey: ["student", "profile"],
    queryFn: () => apiFetch<AlunoProfileDto>("/api/student/profile"),
  });

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      // Wipe the cache so the next account never sees this aluno's data.
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    }
  }

  const p = profile.data;

  return (
    <div className="min-h-screen bg-[#EEF1F5] text-foreground dark:bg-background">
      {/* Desktop top bar */}
      <header className="hidden h-[60px] items-center gap-3.5 border-b border-border bg-white px-8 lg:flex dark:bg-card">
        <Logo size={30} />
        <span className="font-heading text-base font-semibold">Progresso</span>
        <div className="flex-1" />
        {p?.clinicName ? (
          <span className="text-sm text-muted-foreground">{p.clinicName}</span>
        ) : null}
        <div className="flex size-[34px] items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">
          {p ? initials(p.name) : "…"}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-label="Sair"
        >
          <LogOut className="size-4" />
        </Button>
      </header>

      {/* Mobile header */}
      <header className="flex items-center gap-3 bg-primary px-5 py-4 text-primary-foreground lg:hidden">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-base font-semibold">
          {p ? initials(p.name) : "…"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">
            {p ? `Oi, ${p.firstName}!` : "…"}
          </div>
          <div className="truncate text-xs opacity-75">
            {p
              ? [p.coachName ? `Coach: ${p.coachName}` : null, p.clinicName]
                  .filter(Boolean)
                  .join(" · ")
              : ""}
          </div>
        </div>
        {p?.goal ? (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-primary">
            {p.goal}
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-label="Sair"
          className="shrink-0 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground"
        >
          <LogOut className="size-5" />
        </Button>
      </header>

      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-7 lg:px-6 lg:pb-16">
        <div className="grid items-start gap-6 lg:grid-cols-[262px_1fr]">
          {/* Desktop sidebar */}
          <aside className="sticky top-[88px] hidden flex-col gap-4 lg:flex">
            <div className="rounded-2xl bg-white p-5 text-center shadow-[0_1px_12px_rgba(15,23,42,0.06)] dark:bg-card">
              <div className="mx-auto mb-3 flex size-[68px] items-center justify-center rounded-full bg-primary text-[25px] font-semibold text-primary-foreground">
                {p ? initials(p.name) : "…"}
              </div>
              <div className="font-heading text-[17px] font-semibold">
                {p?.name ?? "…"}
              </div>
              {p?.coachName ? (
                <div className="mt-1 text-[12.5px] text-muted-foreground">
                  Coach: {p.coachName}
                </div>
              ) : null}
              <div className="text-[12.5px] text-muted-foreground">
                {p?.clinicName ?? ""}
              </div>
              {p?.goal ? (
                <span className="mt-3 inline-block rounded-full bg-primary-light px-3 py-1 text-[11px] font-bold text-primary">
                  {p.goal}
                </span>
              ) : null}
            </div>
            <nav className="flex flex-col gap-0.5 rounded-2xl bg-white p-2 shadow-[0_1px_12px_rgba(15,23,42,0.06)] dark:bg-card">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = t.id === tab;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors ${
                      active
                        ? "bg-primary-light font-semibold text-primary"
                        : "text-slate-600 hover:bg-muted dark:text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-[19px]" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main content */}
          <main className="min-w-0">
            {tab === "dieta" ? (
              <DietTab />
            ) : tab === "treino" ? (
              <WorkoutTab />
            ) : tab === "checkin" ? (
              <CheckinTab />
            ) : (
              <EvolucaoTab />
            )}
          </main>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-white lg:hidden dark:bg-card">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-center gap-1 border-t-[2.5px] px-1 pb-[calc(0.7rem+env(safe-area-inset-bottom,0))] pt-2.5 text-[11px] ${
                active
                  ? "border-primary font-bold text-primary"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Check-in tab (submit this week's check-in)                                  */
/* -------------------------------------------------------------------------- */

type PhotoSlot = { blob: Blob; url: string; compressing: boolean };

const EMPTY_PHOTOS: Record<CheckinPose, PhotoSlot | null> = {
  frente: null,
  costas: null,
  lado_esquerdo: null,
  lado_direito: null,
};

/**
 * POSTs the multipart check-in via XMLHttpRequest — `fetch` can't report upload
 * progress, so we use XHR's `upload.onprogress` to drive a determinate bar tied
 * to the real byte transfer.
 */
function uploadCheckin(
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<CheckinDto> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/student/checkin");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON body */
      }
      const body = data as {
        error?: string;
        fieldErrors?: Record<string, string>;
      } | null;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as CheckinDto);
      } else {
        reject(
          new ApiError(
            body?.error ?? "Não foi possível enviar o check-in.",
            xhr.status,
            body?.fieldErrors,
          ),
        );
      }
    };
    xhr.onerror = () =>
      reject(new ApiError("Falha de conexão ao enviar o check-in.", 0));
    xhr.send(formData);
  });
}

function CheckinTab() {
  const queryClient = useQueryClient();
  const [photos, setPhotos] =
    useState<Record<CheckinPose, PhotoSlot | null>>(EMPTY_PHOTOS);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: (fd: FormData) => uploadCheckin(fd, setProgress),
    onSuccess: () => {
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ["student", "checkin"] });
    },
  });

  const form = useForm({
    defaultValues: { weightKg: "", note: "" },
    validators: { onChange: checkinSubmitSchema },
    onSubmit: async ({ value }) => {
      const fd = new FormData();
      fd.set("weightKg", value.weightKg);
      if (value.note) fd.set("note", value.note);
      for (const pose of CHECKIN_POSE_VALUES) {
        const slot = photos[pose];
        if (!slot) return; // guarded by the button; defensive
        const ext = slot.blob.type === "image/webp" ? "webp" : "jpg";
        fd.set(pose, slot.blob, `${pose}.${ext}`);
      }
      setProgress(0);
      try {
        await mutation.mutateAsync(fd);
      } catch {
        /* surfaced via mutation.error below */
      }
    },
  });

  async function pickPhoto(pose: CheckinPose, file: File) {
    setPhotos((prev) => {
      if (prev[pose]) URL.revokeObjectURL(prev[pose]!.url);
      return { ...prev, [pose]: { blob: file, url: "", compressing: true } };
    });
    const blob = await compressImage(file);
    const url = URL.createObjectURL(blob);
    setPhotos((prev) => ({ ...prev, [pose]: { blob, url, compressing: false } }));
  }

  function removePhoto(pose: CheckinPose) {
    setPhotos((prev) => {
      if (prev[pose]) URL.revokeObjectURL(prev[pose]!.url);
      return { ...prev, [pose]: null };
    });
  }

  function reset() {
    for (const pose of CHECKIN_POSE_VALUES) {
      if (photos[pose]) URL.revokeObjectURL(photos[pose]!.url);
    }
    setPhotos(EMPTY_PHOTOS);
    setProgress(0);
    setDone(false);
    mutation.reset();
    form.reset();
  }

  const allPhotos = CHECKIN_POSE_VALUES.every(
    (p) => photos[p] && !photos[p]!.compressing,
  );
  const anyCompressing = CHECKIN_POSE_VALUES.some((p) => photos[p]?.compressing);
  const banner =
    mutation.error instanceof ApiError ? mutation.error.message : undefined;

  if (done) {
    return (
      <div className="mt-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Check-in
        </h1>
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl bg-white p-10 text-center shadow-[0_1px_12px_rgba(15,23,42,0.06)] dark:bg-card">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary-light text-primary">
            <Check className="size-7" />
          </div>
          <div>
            <div className="font-heading text-lg font-semibold">
              Check-in enviado ao seu coach 💪
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Ele já pode ver seu peso, seu relato e suas fotos.
            </p>
          </div>
          <Button variant="outline" onClick={reset}>
            Enviar outro check-in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="mt-2"
    >
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Check-in semanal
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Registrado na data de hoje. Seu coach recebe assim que você enviar.
      </p>

      <div className="mt-5 flex flex-col gap-5 rounded-2xl bg-white p-5 shadow-[0_1px_12px_rgba(15,23,42,0.06)] dark:bg-card">
        {/* Weight */}
        <form.Field name="weightKg">
          {(field) => (
            <Field
              id="weightKg"
              label="Peso atual (kg)"
              type="text"
              inputMode="decimal"
              placeholder="71,4"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              error={fieldError(field)}
            />
          )}
        </form.Field>

        {/* Note */}
        <form.Field name="note">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="note">Como foi a semana?</Label>
              <Textarea
                id="note"
                rows={4}
                placeholder="Ótima! Consegui bater todas as séries…"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Opcional.</p>
            </div>
          )}
        </form.Field>

        {/* Photos */}
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label>Fotos</Label>
            <span className="text-xs text-muted-foreground">
              As 4 poses são obrigatórias
            </span>
          </div>

          <details className="overflow-hidden rounded-xl border border-border bg-muted/40">
            <summary className="flex cursor-pointer items-center justify-between px-3 py-2.5 text-[12.5px] font-semibold text-foreground">
              Como tirar as fotos
              <ChevronRight className="size-4 text-muted-foreground" />
            </summary>
            <ol className="flex list-decimal flex-col gap-1.5 px-7 pb-3 text-[12.5px] leading-snug text-muted-foreground">
              {CHECKIN_POSE_VALUES.map((pose) => (
                <li key={pose}>
                  <strong className="font-semibold text-foreground">
                    {CHECKIN_POSE_LABELS[pose]}
                  </strong>{" "}
                  — {CHECKIN_POSE_INSTRUCTIONS[pose]}
                </li>
              ))}
            </ol>
          </details>

          <div className="grid grid-cols-2 gap-2.5">
            {CHECKIN_POSE_VALUES.map((pose) => (
              <PhotoUploadSlot
                key={pose}
                pose={pose}
                slot={photos[pose]}
                disabled={mutation.isPending}
                onPick={(file) => pickPhoto(pose, file)}
                onRemove={() => removePhoto(pose)}
              />
            ))}
          </div>
        </div>

        {banner ? (
          <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
            {banner}
          </div>
        ) : null}

        {/* Submit + upload progress bar (tight to the transfer) */}
        {mutation.isPending ? (
          <div
            className="space-y-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Enviando check-in"
          >
            <div className="flex items-center justify-between text-[13px] font-medium text-foreground">
              <span>{progress < 100 ? "Enviando…" : "Finalizando…"}</span>
              <span className="tabular-nums text-muted-foreground">
                {progress}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <form.Subscribe selector={(s) => s.canSubmit}>
            {(canSubmit) => (
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={!canSubmit || !allPhotos}
              >
                {anyCompressing ? "Processando fotos…" : "Enviar check-in"}
              </Button>
            )}
          </form.Subscribe>
        )}
      </div>
    </form>
  );
}

/** One pose upload card: empty (pick), compressing (spinner), or a thumbnail. */
function PhotoUploadSlot({
  pose,
  slot,
  disabled,
  onPick,
  onRemove,
}: {
  pose: CheckinPose;
  slot: PhotoSlot | null;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = CHECKIN_POSE_LABELS[pose];
  const ready = slot !== null && !slot.compressing;

  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-xl">
      {ready ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          <img
            src={slot.url}
            alt={label}
            className="h-full w-full object-cover"
          />
          {/* Pose caption over a bottom gradient so it stays legible on any photo. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5">
            <span className="text-[11px] font-semibold text-white">{label}</span>
          </div>
          <span className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="size-3" />
          </span>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remover ${label}`}
            className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 disabled:opacity-50"
          >
            <X className="size-3.5" />
          </button>
        </>
      ) : slot?.compressing ? (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-input bg-muted/30 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-[11px]">Comprimindo…</span>
          <span className="text-[11px] font-semibold text-foreground">
            {label}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-input bg-white text-center transition-colors hover:border-primary/60 hover:bg-primary-light/40 disabled:opacity-50 dark:bg-card"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Camera className="size-4" />
          </span>
          <span className="px-2 text-[11.5px] font-semibold leading-tight text-foreground">
            {label}
          </span>
          <span className="text-[11px] text-muted-foreground">Adicionar</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label={`Enviar ${label}`}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Evolução tab (weight chart + check-in history)                             */
/* -------------------------------------------------------------------------- */

/** "71,4" — one decimal, comma separator (pt-BR). */
function formatWeightKg(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

/** "11/08/2026" from a `YYYY-MM-DD` string, timezone-safe (no Date parsing). */
function formatIsoDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function EvolucaoTab() {
  const state = useQuery({
    queryKey: ["student", "checkin"],
    queryFn: () => apiFetch<CheckinListDto>("/api/student/checkin"),
  });

  if (state.isPending) {
    return <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>;
  }
  if (state.isError) {
    return (
      <p className="mt-8 text-sm text-red-600">
        Não foi possível carregar sua evolução. Tente novamente.
      </p>
    );
  }

  const { checkins, weightSeries } = state.data;

  if (checkins.length === 0) {
    return (
      <div className="mt-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Minha evolução
        </h1>
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-white/60 p-10 text-center dark:bg-card/60">
          <p className="text-sm text-muted-foreground">
            Você ainda não enviou nenhum check-in. Faça seu primeiro na aba
            Check-in e acompanhe sua evolução aqui.
          </p>
        </div>
      </div>
    );
  }

  const first = weightSeries[0]?.weightKg;
  const last = weightSeries[weightSeries.length - 1]?.weightKg;
  const delta =
    first !== undefined && last !== undefined ? last - first : undefined;

  return (
    <div className="mt-2 min-w-0">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Minha evolução
      </h1>

      {/* Weight chart */}
      {weightSeries.length > 0 ? (
        <div className="mt-5 rounded-2xl bg-white p-4 shadow-[0_1px_12px_rgba(15,23,42,0.06)] dark:bg-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">Peso</span>
            {delta !== undefined && delta !== 0 ? (
              <span
                className={cn(
                  "flex items-center gap-1 text-[13px] font-semibold",
                  delta < 0 ? "text-primary" : "text-amber-600",
                )}
              >
                {delta < 0 ? (
                  <TrendingDown className="size-4" />
                ) : (
                  <TrendingUp className="size-4" />
                )}
                {delta < 0 ? "−" : "+"}
                {formatWeightKg(Math.abs(delta))} kg
                <span className="font-normal text-muted-foreground">
                  em {weightSeries.length} check-ins
                </span>
              </span>
            ) : null}
          </div>
          <WeightChart series={weightSeries} />
        </div>
      ) : null}

      {/* History */}
      <div className="mt-4 rounded-2xl bg-white p-4 shadow-[0_1px_12px_rgba(15,23,42,0.06)] dark:bg-card">
        <div className="mb-2 text-sm font-semibold">Histórico de check-ins</div>
        <div className="flex flex-col">
          {checkins.map((c) => (
            <CheckinRow key={c.id} checkin={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Inline SVG weight line (area + stroke + dots), oldest → newest. */
function WeightChart({ series }: { series: WeightPointDto[] }) {
  const W = 320;
  const H = 120;
  const pad = 10;
  const weights = series.map((s) => s.weightKg);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const span = max - min || 1;
  const n = series.length;
  const x = (i: number) =>
    n === 1 ? W / 2 : pad + (i / (n - 1)) * (W - pad * 2);
  const y = (w: number) => pad + (1 - (w - min) / span) * (H - pad * 2);
  const pts = series.map((s, i) => [x(i), y(s.weightKg)] as const);
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const area = `${line} L${pts[n - 1][0].toFixed(1)} ${H - pad} L${pts[0][0].toFixed(1)} ${H - pad} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-[120px] w-full overflow-visible"
      role="img"
      aria-label="Gráfico de evolução do peso"
    >
      <defs>
        <linearGradient id="checkinWeight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#checkinWeight)" />
      <path
        d={line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill="var(--primary)" />
      ))}
    </svg>
  );
}

/** One timeline row: date + weight + note, with a coach-entry marker. */
function CheckinRow({ checkin }: { checkin: CheckinDto }) {
  return (
    <div className="flex items-start gap-3 border-b border-[#F1F5F9] py-2.5 last:border-b-0 dark:border-border">
      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-semibold">
            {checkin.weightKg !== null
              ? `${formatWeightKg(checkin.weightKg)} kg`
              : "Anotação"}
          </span>
          {checkin.author === "coach" ? (
            <Badge
              variant="neutral"
              className="h-4 px-1.5 py-0 text-[10px] font-semibold"
            >
              coach
            </Badge>
          ) : null}
          {checkin.photoCount > 0 ? (
            <span className="text-[11.5px] text-muted-foreground">
              {checkin.photoCount}{" "}
              {checkin.photoCount === 1 ? "foto" : "fotos"}
            </span>
          ) : null}
        </div>
        {checkin.note ? (
          <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">
            {checkin.note}
          </p>
        ) : null}
      </div>
      <span className="shrink-0 text-[12px] text-muted-foreground">
        {formatIsoDate(checkin.date)}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dieta tab                                                                   */
/* -------------------------------------------------------------------------- */

function DietTab() {
  const [selectedFood, setSelectedFood] = useState<TreeItem | null>(null);
  const [historyVersionId, setHistoryVersionId] = useState<string | null>(null);

  const state = useQuery({
    queryKey: ["student", "diet"],
    queryFn: () => apiFetch<MyDietStateDto>("/api/student/diet"),
  });

  if (state.isPending) {
    return <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>;
  }
  if (state.isError) {
    return (
      <p className="mt-8 text-sm text-red-600">
        Não foi possível carregar sua dieta. Tente novamente.
      </p>
    );
  }

  const { current, history } = state.data;

  // History rows: every published version except the current active one,
  // newest first. Flat, read-only list (faithful to the design).
  const historyRows = history
    .flatMap((d) =>
      d.versions.map((v) => ({
        versionId: v.versionId,
        version: v.version,
        dietId: d.dietId,
        dietName: d.dietName,
        status: d.status,
        publishedAt: v.publishedAt,
      })),
    )
    .filter(
      (r) =>
        !(
          current &&
          r.dietId === current.dietId &&
          r.version === current.version
        ),
    )
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  if (!current && historyRows.length === 0) {
    return (
      <div className="mt-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Dieta
        </h1>
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-white/60 p-10 text-center dark:bg-card/60">
          <p className="text-sm text-muted-foreground">
            Você ainda não tem uma dieta. Assim que seu coach publicar, ela
            aparece aqui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {current ? (
        <>
          {/* Header */}
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2.5">
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-tight">
                {current.dietName}
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Versão {current.version} · publicada em{" "}
                {formatDate(current.publishedAt)}
              </p>
            </div>
            <Badge className="bg-primary-light font-semibold text-primary">
              v{current.version} vigente
            </Badge>
          </div>

          {/* Total macros + ratio */}
          <div className="mb-4 rounded-2xl bg-white p-4 shadow-[0_1px_12px_rgba(15,23,42,0.06)] dark:bg-card">
            <MacroSummary totals={current.tree.totals} />
            <RatioBar macros={current.tree.totals} className="mt-3.5" />
          </div>

          {/* Meals */}
          <div className="grid gap-4 lg:grid-cols-2">
            {current.tree.meals.map((meal, mi) => (
              <MealCard key={mi} meal={meal} onOpenFood={setSelectedFood} />
            ))}
          </div>
        </>
      ) : (
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Dieta
        </h1>
      )}

      {/* History */}
      {historyRows.length > 0 ? (
        <section className="mt-8 border-t border-border pt-5">
          <h2 className="mb-3 font-heading text-[15px] font-semibold text-muted-foreground">
            Dietas anteriores
          </h2>
          <div className="flex flex-col gap-2.5">
            {historyRows.map((r) => (
              <button
                key={r.versionId}
                onClick={() => setHistoryVersionId(r.versionId)}
                className="flex items-center gap-3.5 rounded-xl bg-white p-3.5 text-left shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:bg-muted/40 dark:bg-card"
              >
                <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] bg-slate-800 font-heading text-[12.5px] font-bold text-white">
                  v{r.version}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold">
                    {r.dietName}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.status === "archived" ? "Arquivada" : "Ativa"} · publicada
                    em {formatDate(r.publishedAt)}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <FoodDetailDialog
        item={selectedFood}
        onClose={() => setSelectedFood(null)}
      />
      <HistoryVersionDialog
        versionId={historyVersionId}
        onClose={() => setHistoryVersionId(null)}
      />
    </div>
  );
}

/** The P/C/G distribution bar. */
function RatioBar({
  macros,
  className = "",
}: {
  macros: DietMacrosDto;
  className?: string;
}) {
  return (
    <div className={`flex h-1.5 overflow-hidden rounded bg-muted ${className}`}>
      {macroRatio(macros).map((seg, i) => (
        <div key={i} className={seg.color} style={{ width: `${seg.pct}%` }} />
      ))}
    </div>
  );
}

/** One meal: header + clickable food rows + per-meal macro footer. */
function MealCard({
  meal,
  onOpenFood,
}: {
  meal: TreeMeal;
  onOpenFood: (item: TreeItem) => void;
}) {
  return (
    <div className="self-start overflow-hidden rounded-2xl bg-white shadow-[0_1px_12px_rgba(15,23,42,0.06)] dark:bg-card">
      <div className="flex items-baseline gap-2.5 border-b border-[#EEF2F7] px-[18px] py-3.5 dark:border-border">
        <span className="font-heading text-[15px] font-semibold">
          {meal.name}
        </span>
        {meal.time ? (
          <span className="text-xs text-muted-foreground">{meal.time}</span>
        ) : null}
      </div>
      {meal.items.map((item, ii) => {
        const q = quantity(item.grams, item.measureLabel, item.measureGrams);
        return (
          <button
            key={ii}
            onClick={() => onOpenFood(item)}
            className="flex w-full items-start gap-3 border-b border-[#F4F6FA] px-[18px] py-3 text-left text-[13px] transition-colors last:border-b-0 hover:bg-muted/40 dark:border-border"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground">
                {item.description}
              </div>
              {subCount(item) > 0 ? (
                <div className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-amber-700">
                  <Repeat className="size-3 shrink-0" />
                  <span>
                    {subCount(item)}{" "}
                    {subCount(item) === 1 ? "substituição" : "substituições"}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <div className="whitespace-nowrap text-[13.5px] font-bold text-foreground">
                {q.main}
              </div>
              {q.sub ? (
                <div className="mt-px text-[11px] text-muted-foreground">
                  {q.sub}
                </div>
              ) : null}
              {item.macros.energyKcal !== null ? (
                <div className="mt-px text-[11px] text-muted-foreground/70">
                  {formatKcal(item.macros.energyKcal)} kcal
                </div>
              ) : null}
            </div>
            <ChevronRight className="mt-1 size-4 shrink-0 self-center text-muted-foreground" />
          </button>
        );
      })}
      <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 bg-muted/30 px-[18px] py-2.5 dark:bg-muted/10">
        <MacroSummary totals={meal.totals} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Food-detail dialog (macros + distribution + substitutions)                 */
/* -------------------------------------------------------------------------- */

function FoodDetailDialog({
  item,
  onClose,
}: {
  item: TreeItem | null;
  onClose: () => void;
}) {
  const macroCards = item
    ? [
        {
          label: "Calorias",
          value: formatKcal(item.macros.energyKcal),
          unit: "kcal",
          color: "text-primary",
          bg: "bg-primary-light",
        },
        {
          label: "Proteínas",
          value: formatGrams(item.macros.protein),
          unit: "",
          color: "text-blue-600",
          bg: "bg-blue-50 dark:bg-blue-950/40",
        },
        {
          label: "Carboidratos",
          value: formatGrams(item.macros.carbohydrate),
          unit: "",
          color: "text-red-600",
          bg: "bg-red-50 dark:bg-red-950/40",
        },
        {
          label: "Gorduras",
          value: formatGrams(item.macros.fat),
          unit: "",
          color: "text-amber-600",
          bg: "bg-amber-50 dark:bg-amber-950/40",
        },
      ]
    : [];
  const q = item
    ? quantity(item.grams, item.measureLabel, item.measureGrams)
    : null;

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[520px]">
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-lg">
                {item.description}
              </DialogTitle>
              <p className="text-[12.5px] text-muted-foreground">
                Porção: {q!.main}
                {q!.sub ? ` · ${q!.sub}` : ""}
              </p>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {macroCards.map((mc) => (
                <div key={mc.label} className={`rounded-xl p-3.5 ${mc.bg}`}>
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`font-heading text-[22px] font-bold ${mc.color}`}
                    >
                      {mc.value}
                    </span>
                    {mc.unit ? (
                      <span
                        className={`text-xs font-semibold opacity-80 ${mc.color}`}
                      >
                        {mc.unit}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs font-medium text-muted-foreground">
                    {mc.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-white p-3.5 shadow-[0_1px_8px_rgba(15,23,42,0.05)] dark:bg-card">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Distribuição de macros
              </div>
              <div className="flex h-2 overflow-hidden rounded bg-muted">
                {macroRatio(item.macros).map((seg, i) => (
                  <div
                    key={i}
                    className={seg.color}
                    style={{ width: `${seg.pct}%` }}
                  />
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-3.5 text-[11.5px] font-semibold">
                <span className="text-blue-600">● Proteína</span>
                <span className="text-red-600">● Carbo</span>
                <span className="text-amber-600">● Gordura</span>
              </div>
            </div>

            {subCount(item) > 0 ? (
              <div>
                <div className="mb-2 font-heading text-[15px] font-semibold">
                  Substituições equivalentes
                </div>
                <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)] dark:bg-card">
                  {/* Coach-defined equivalences (already scaled, may use a measure). */}
                  {item.substitutes.map((s, si) => {
                    const sq = quantity(
                      s.grams,
                      s.measureLabel,
                      s.measureGrams,
                    );
                    return (
                      <div
                        key={`e${si}`}
                        className="flex items-center gap-2 border-b border-[#F4F6FA] px-3.5 py-3 text-[13px] text-amber-700 last:border-b-0 dark:border-border"
                      >
                        <Repeat className="size-3.5 shrink-0" />
                        <span>
                          ≈ {sq.main} {s.description}
                        </span>
                      </div>
                    );
                  })}
                  {/* Catalog substitutes (scaled to the portion). */}
                  {catalogSubs(item).map((s) => (
                    <div
                      key={`c${s.foodId}`}
                      className="flex items-center gap-2 border-b border-[#F4F6FA] px-3.5 py-3 text-[13px] text-amber-700 last:border-b-0 dark:border-border"
                    >
                      <Repeat className="size-3.5 shrink-0" />
                      <span>
                        ≈ {formatGrams(s.grams)} {s.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  History version dialog (flat, read-only)                                    */
/* -------------------------------------------------------------------------- */

function HistoryVersionDialog({
  versionId,
  onClose,
}: {
  versionId: string | null;
  onClose: () => void;
}) {
  const version = useQuery({
    queryKey: ["student", "diet", "version", versionId],
    queryFn: () =>
      apiFetch<StudentDietVersionDto>(
        `/api/student/diet/versions/${versionId}`,
      ),
    enabled: versionId !== null,
  });

  return (
    <Dialog open={versionId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            {version.data
              ? `${version.data.dietName} · v${version.data.version}`
              : "Dieta"}
          </DialogTitle>
          {version.data ? (
            <p className="text-[12.5px] text-muted-foreground">
              Publicada em {formatDate(version.data.publishedAt)}
            </p>
          ) : null}
        </DialogHeader>

        {version.isPending && versionId ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : version.isError ? (
          <p className="text-sm text-red-600">
            Não foi possível carregar esta versão.
          </p>
        ) : version.data ? (
          <div className="flex flex-col gap-3.5">
            {version.data.tree.meals.map((meal, mi) => (
              <div
                key={mi}
                className="overflow-hidden rounded-xl bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)] dark:bg-card"
              >
                <div className="border-b border-[#EEF2F7] px-4 py-3 font-heading text-sm font-semibold dark:border-border">
                  {meal.name}
                  {meal.time ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {meal.time}
                    </span>
                  ) : null}
                </div>
                {meal.items.map((item, ii) => {
                  const q = quantity(
                    item.grams,
                    item.measureLabel,
                    item.measureGrams,
                  );
                  return (
                    <div
                      key={ii}
                      className="flex items-center justify-between gap-2.5 border-b border-[#F4F6FA] px-4 py-2.5 text-[12.5px] last:border-b-0 dark:border-border"
                    >
                      <span className="font-medium text-foreground">
                        {item.description}
                      </span>
                      <span className="shrink-0 whitespace-nowrap font-semibold text-muted-foreground">
                        {q.main}
                        {q.sub ? ` · ${q.sub}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Versão arquivada · somente leitura.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Treino tab                                                                  */
/* -------------------------------------------------------------------------- */

function WorkoutTab() {
  const [detail, setDetail] = useState<{
    exercise: WorkoutExerciseDto;
    group: GroupInfo | null;
  } | null>(null);
  const [historyVersionId, setHistoryVersionId] = useState<string | null>(null);

  const state = useQuery({
    queryKey: ["student", "workout"],
    queryFn: () => apiFetch<MyWorkoutStateDto>("/api/student/workout"),
  });

  if (state.isPending) {
    return <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>;
  }
  if (state.isError) {
    return (
      <p className="mt-8 text-sm text-red-600">
        Não foi possível carregar seu treino. Tente novamente.
      </p>
    );
  }

  const { current, history } = state.data;

  const historyRows = history
    .flatMap((w) =>
      w.versions.map((v) => ({
        versionId: v.versionId,
        version: v.version,
        workoutId: w.workoutId,
        workoutName: w.workoutName,
        status: w.status,
        publishedAt: v.publishedAt,
      })),
    )
    .filter(
      (r) =>
        !(
          current &&
          r.workoutId === current.workoutId &&
          r.version === current.version
        ),
    )
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  if (!current && historyRows.length === 0) {
    return (
      <div className="mt-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Treino
        </h1>
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-white/60 p-10 text-center dark:bg-card/60">
          <p className="text-sm text-muted-foreground">
            Você ainda não tem um treino. Assim que seu coach publicar, ele
            aparece aqui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {current ? (
        <>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2.5">
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-tight">
                {current.workoutName}
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Versão {current.version} · publicada em{" "}
                {formatDate(current.publishedAt)}
              </p>
            </div>
            <Badge className="bg-primary-light font-semibold text-primary">
              v{current.version} vigente
            </Badge>
          </div>

          <WorkoutSessionsView
            sessions={current.sessions}
            onExerciseClick={(exercise, group) => setDetail({ exercise, group })}
          />
        </>
      ) : (
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Treino
        </h1>
      )}

      {historyRows.length > 0 ? (
        <section className="mt-8 border-t border-border pt-5">
          <h2 className="mb-3 font-heading text-[15px] font-semibold text-muted-foreground">
            Treinos anteriores
          </h2>
          <div className="flex flex-col gap-2.5">
            {historyRows.map((r) => (
              <button
                key={r.versionId}
                onClick={() => setHistoryVersionId(r.versionId)}
                className="flex items-center gap-3.5 rounded-xl bg-white p-3.5 text-left shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:bg-muted/40 dark:bg-card"
              >
                <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] bg-slate-800 font-heading text-[12.5px] font-bold text-white">
                  v{r.version}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold">
                    {r.workoutName}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.status === "archived" ? "Arquivado" : "Ativo"} · publicado
                    em {formatDate(r.publishedAt)}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <WorkoutExerciseDetail
        exercise={detail?.exercise ?? null}
        group={detail?.group ?? null}
        onClose={() => setDetail(null)}
      />
      <WorkoutHistoryDialog
        versionId={historyVersionId}
        onClose={() => setHistoryVersionId(null)}
      />
    </div>
  );
}

function WorkoutHistoryDialog({
  versionId,
  onClose,
}: {
  versionId: string | null;
  onClose: () => void;
}) {
  const version = useQuery({
    queryKey: ["student", "workout", "version", versionId],
    queryFn: () =>
      apiFetch<StudentWorkoutVersionDto>(
        `/api/student/workout/versions/${versionId}`,
      ),
    enabled: versionId !== null,
  });

  return (
    <Dialog open={versionId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            {version.data
              ? `${version.data.workoutName} · v${version.data.version}`
              : "Treino"}
          </DialogTitle>
          {version.data ? (
            <p className="text-[12.5px] text-muted-foreground">
              Publicado em {formatDate(version.data.publishedAt)}
            </p>
          ) : null}
        </DialogHeader>

        {version.isPending && versionId ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : version.isError ? (
          <p className="text-sm text-red-600">
            Não foi possível carregar esta versão.
          </p>
        ) : version.data ? (
          <div className="flex flex-col gap-3.5">
            <WorkoutSessionsView sessions={version.data.sessions} />
            <p className="text-xs text-muted-foreground">
              Versão arquivada · somente leitura.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
