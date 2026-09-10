"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import {
  Camera,
  Check,
  ClipboardList,
  Clock,
  MessageCircle,
  Pencil,
  Plus,
  Ruler,
  Sparkles,
  Trash2,
} from "lucide-react";

import type { CheckinPose, Modality } from "@/db/schema";
import { StudentTabs } from "@/components/students/student-tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";
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
import { Textarea } from "@/components/ui/textarea";
import {
  AssessmentFields,
  assessmentFormHasValues,
  assessmentFormFromDto,
  assessmentFormToPayload,
  emptyAssessmentForm,
  type AssessmentFormValues,
} from "@/components/checkins/assessment-fields";
import { AssessmentView } from "@/components/checkins/assessment-view";
import { PlanSnapshotView } from "@/components/checkins/plan-snapshot";
import {
  anyCompressing as anySlotCompressing,
  appendPhotos,
  CheckinPhotoGrid,
  PhotoUploadSlot,
  uploadCheckinForm,
  usePhotoSlots,
} from "@/components/checkins/photo-upload";
import {
  bodyFatSourceLabel,
  defaultNoteBody,
  EVALUATION_VERDICT_HINTS,
  EVALUATION_VERDICT_LABELS,
  type AiEvaluationDto,
  type AiEvaluationRunDto,
} from "@/lib/ai-evaluation";
import { formatAiUsage } from "@/lib/ai-programs";
import { round1 } from "@/lib/body-composition";
import type { PlanUsageDto } from "@/lib/plans";
import type { StudentAnamnesisDto } from "@/lib/student-anamneses";
import type { AssessmentPreset } from "@/lib/checkin-assessment";
import type { ClinicSettingsDto } from "@/lib/clinic-settings";
import { apiFetch, ApiError } from "@/lib/api-client";
import { todayYmd } from "@/lib/calendar";
import { fieldError } from "@/lib/form";
import { MODALITY_LABELS, MODALITY_VALUES } from "@/lib/students";
import {
  CHECKIN_MIN_DATE,
  CHECKIN_POSE_VALUES,
  COACH_CHECKIN_DEFAULT_MODALITY,
  coachCheckinSchema,
  formatCheckinDate,
  formatCheckinWeight,
  isCheckinPending,
  type CheckinDetailDto,
  type CheckinDto,
  type CheckinListDto,
} from "@/lib/student-checkins";
import type { StudentRosterDto } from "@/lib/students";

/* -------------------------------------------------------------------------- */
/*  Entry classification (derives the design's online/coach/presencial tags)   */
/* -------------------------------------------------------------------------- */

type EntryStyle = { title: string; tag: string; className: string };

function entryStyle(c: CheckinDto): EntryStyle {
  if (c.author === "student") {
    return {
      title: "Check-in",
      tag: "online",
      className: "bg-primary-light text-primary",
    };
  }
  // A coach note with nothing attached is an annotation however it was
  // collected — there is no check-in to classify.
  if (!c.hasAssessment && c.photoCount === 0 && c.weightKg === null) {
    return {
      title: "Anotação do coach",
      tag: "coach",
      className: "bg-violet-100 text-violet-700 dark:bg-violet-950/40",
    };
  }
  // Otherwise the coach SAID which it was when they logged it. This used to be
  // guessed from the payload — weight or photos meant "presencial" — which
  // quietly mislabelled every check-in a coach relayed from WhatsApp.
  return c.modality === "in_person"
    ? {
        title: "Avaliação presencial",
        tag: "presencial",
        className: "bg-amber-100 text-warn-fg dark:bg-amber-950/40",
      }
    : {
        // Tag "coach", not "online": the title already says how it happened, and
        // repeating it would read "Check-in online online" — and open exactly
        // like an aluno's own card, which this is not.
        title: "Check-in online",
        tag: "coach",
        className: "bg-violet-100 text-violet-700 dark:bg-violet-950/40",
      };
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function StudentFeedbackPage() {
  const { id } = useParams<{ id: string }>();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const student = useQuery({
    queryKey: ["student", id],
    queryFn: () =>
      apiFetch<{ student: StudentRosterDto }>(`/api/students/${id}`).then(
        (r) => r.student,
      ),
  });

  const state = useQuery({
    queryKey: ["coach-checkins", id],
    queryFn: () => apiFetch<CheckinListDto>(`/api/students/${id}/checkin`),
    retry: false,
  });

  const name = student.data
    ? `${student.data.firstName} ${student.data.lastName}`
    : "Aluno";

  const checkins = state.data?.checkins ?? [];
  const pendingCount = checkins.filter(isCheckinPending).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/coach/students"
        className="text-body-dense text-meta transition-colors hover:text-primary"
      >
        ← Alunos
      </Link>
      <h1 className="mt-2 font-heading text-2xl font-bold text-foreground">
        {name}
      </h1>
      <div className="mt-4">
        <StudentTabs studentId={id} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-heading text-base font-semibold">
            Timeline de feedback
          </h2>
          {pendingCount > 0 ? (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-caption font-semibold text-destructive">
              {pendingCount} aguardando
            </span>
          ) : null}
        </div>
        <Button onClick={() => setManualOpen(true)}>
          <Plus className="size-4" />
          Novo check-in
        </Button>
      </div>

      {state.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>
      ) : state.isError ? (
        <p className="mt-8 text-sm text-destructive">
          {(state.error as Error).message}
        </p>
      ) : checkins.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-white/60 p-10 text-center dark:bg-card/60">
          <p className="text-sm text-muted-foreground">
            Nenhum check-in ainda. Quando o aluno enviar um check-in, ele aparece
            aqui para você responder — ou registre um check-in presencial.
          </p>
        </div>
      ) : (
        <div className="relative mt-6 pl-6">
          <div className="absolute bottom-1.5 left-[7px] top-1.5 w-0.5 bg-border" />
          {checkins.map((c) => (
            <TimelineCard
              key={c.id}
              checkin={c}
              onOpen={() => setDetailId(c.id)}
            />
          ))}
        </div>
      )}

      <ReviewDialog
        studentId={id}
        checkinId={detailId}
        onClose={() => setDetailId(null)}
      />
      <ManualCheckinDialog
        studentId={id}
        open={manualOpen}
        existingDates={checkins.map((c) => c.date)}
        onClose={() => setManualOpen(false)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Timeline card                                                              */
/* -------------------------------------------------------------------------- */

function TimelineCard({
  checkin,
  onOpen,
}: {
  checkin: CheckinDto;
  onOpen: () => void;
}) {
  const style = entryStyle(checkin);
  const pending = isCheckinPending(checkin);
  const answered = checkin.author === "student" && checkin.feedbackAt !== null;

  return (
    <div className="relative mb-3.5">
      <span
        className={`absolute -left-[22px] top-4 size-3 rounded-full border-[3px] border-background ${
          checkin.author === "student" ? "bg-primary" : "bg-violet-500"
        }`}
      />
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-2xl bg-white p-4 text-left shadow-rest transition-colors hover:border-primary/40 dark:bg-card"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{style.title}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-caption font-semibold ${style.className}`}
          >
            {style.tag}
          </span>
          {pending ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-caption font-semibold text-destructive">
              <Clock className="size-3" /> aguarda resposta
            </span>
          ) : null}
          <span className="ml-auto text-label text-muted-foreground">
            {formatCheckinDate(checkin.date)}
          </span>
        </div>

        {checkin.weightKg !== null ? (
          <div className="mt-1.5 text-body-dense font-semibold text-primary">
            Peso: {formatCheckinWeight(checkin.weightKg)} kg
          </div>
        ) : null}
        {checkin.note ? (
          <p className="mt-1 line-clamp-2 text-body-dense text-muted-foreground">
            {checkin.note}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-3 text-label text-muted-foreground">
          {checkin.photoCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Camera className="size-3.5" />
              {checkin.photoCount} {checkin.photoCount === 1 ? "foto" : "fotos"}
            </span>
          ) : null}
          {checkin.hasAssessment ? (
            <span className="inline-flex items-center gap-1">
              <Ruler className="size-3.5" /> medidas
            </span>
          ) : null}
          {answered ? (
            <span className="inline-flex items-center gap-1 font-medium text-primary">
              <Check className="size-3.5" /> respondido
            </span>
          ) : null}
        </div>

        {answered && checkin.feedback ? (
          <div className="mt-2.5 rounded-xl border border-primary/20 bg-primary-light/40 px-3 py-2 text-body-dense text-foreground">
            <span className="font-semibold text-primary">Você: </span>
            <span className="line-clamp-2">{checkin.feedback}</span>
          </div>
        ) : null}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Review dialog (see data + photos, respond, optional assessment)            */
/* -------------------------------------------------------------------------- */

function ReviewDialog({
  studentId,
  checkinId,
  onClose,
}: {
  studentId: string;
  checkinId: string | null;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const detail = useQuery({
    queryKey: ["coach-checkin", studentId, checkinId],
    queryFn: () =>
      apiFetch<CheckinDetailDto>(
        `/api/students/${studentId}/checkin/${checkinId}`,
      ),
    enabled: checkinId !== null,
  });

  const d = detail.data;

  function close() {
    setEditing(false);
    onClose();
  }

  return (
    <Dialog open={checkinId !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            {!d
              ? "Check-in"
              : d.author === "student"
                ? "Check-in do aluno"
                : d.weightKg === null &&
                    d.photos.length === 0 &&
                    d.assessment === null
                  ? "Anotação do coach"
                  : d.modality === "in_person"
                    ? "Avaliação presencial"
                    : "Check-in online"}
          </DialogTitle>
          {d ? (
            <p className="text-body-dense text-muted-foreground">
              {formatCheckinDate(d.date)}
              {d.weightKg !== null
                ? ` · ${formatCheckinWeight(d.weightKg)} kg`
                : ""}
            </p>
          ) : null}
        </DialogHeader>

        {detail.isPending && checkinId ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : detail.isError ? (
          <p className="text-sm text-destructive">
            Não foi possível carregar este check-in.
          </p>
        ) : d && editing ? (
          <EditCheckinForm
            key={`edit-${d.id}`}
            studentId={studentId}
            detail={d}
            onDone={() => setEditing(false)}
          />
        ) : d ? (
          <div className="flex flex-col gap-4">
            {d.note ? (
              <div className="rounded-xl bg-muted/40 px-3.5 py-3 text-body-dense text-foreground">
                {d.note}
              </div>
            ) : null}

            {d.photos.length > 0 ? (
              <CheckinPhotos studentId={studentId} detail={d} />
            ) : null}

            {d.assessment ? <AssessmentView assessment={d.assessment} /> : null}

            <EvaluationSection key={`ai-${d.id}`} studentId={studentId} detail={d} />

            <PlanSnapshotView diet={d.diet} workout={d.workout} />

            {/* Keyed by the check-in id so the form (re)initializes from this
                detail without a render-phase or effect setState. */}
            {d.author === "student" ? (
              <ReviewForm
                key={d.id}
                studentId={studentId}
                detail={d}
                onClose={onClose}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-4" />
                Editar check-in
              </Button>
              <DeleteCheckin
                key={`del-${d.id}`}
                studentId={studentId}
                detail={d}
                onDeleted={close}
              />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The clinic's default avaliação preset, so a new assessment opens on the form
 * the clinic actually uses instead of all 21 inputs.
 *
 * A hook rather than a prop threaded through three dialogs: TanStack Query
 * dedupes by key, so the three call sites share one request, and it is the same
 * key the Configurações screen writes — saving a new default there updates
 * these without a reload.
 */
function useDefaultPreset(): AssessmentPreset {
  const settings = useQuery({
    queryKey: ["coach-settings"],
    queryFn: () => apiFetch<ClinicSettingsDto>("/api/coach/settings"),
  });
  return settings.data?.assessmentPreset ?? "completa";
}

/**
 * "Avaliar com IA" — the model's read of this check-in, and the coach's decision
 * on it.
 *
 * Three things here are deliberate and easy to erode:
 *
 * - **The draft is server-side.** A vision call takes seconds and costs a
 *   credit; losing it to a closed dialog is how a coach learns not to press the
 *   button. Reopening the check-in shows the same pending draft.
 * - **% de gordura and massa magra are coupled.** Editing either recomputes the
 *   other, so the pair can never be saved contradicting itself. Only the fat
 *   percentage is sent — the lean figure is its complement by definition.
 * - **Accepting writes a coach-only note, and nothing else the aluno can see.**
 *   The advice is addressed to the coach; the student-facing feedback box below
 *   is untouched on purpose.
 */
/**
 * "Avaliar com IA" — the model's read of this check-in, and the coach's decision
 * on it.
 *
 * **It lives in its own modal**, not inline in the review dialog. The review
 * dialog is already a dense screen — photos, measures, plan snapshot, the
 * feedback the aluno will read — and the evaluation is a separate act with its
 * own decision at the end of it. Inline, the two competed: the coach could not
 * tell which textarea the aluno receives and which one only they see. A modal
 * makes that boundary physical. (Nested dialogs are an established pattern
 * here — the photo lightbox stacks over this same review dialog.)
 *
 * Three things are deliberate and easy to erode:
 *
 * - **The draft is server-side.** A vision call takes seconds and costs a
 *   credit; losing it to a closed dialog is how a coach learns not to press the
 *   button. Reopening the check-in shows the same pending draft.
 * - **% de gordura and massa magra are coupled.** Editing either recomputes the
 *   other, so the pair can never be saved contradicting itself. Only the fat
 *   percentage is sent — the lean figure is its complement by definition.
 * - **Accepting writes a coach-only note, and nothing else the aluno can see.**
 *   The advice is addressed to the coach; the student-facing feedback box in the
 *   review dialog is untouched on purpose.
 */
function EvaluationSection({
  studentId,
  detail,
}: {
  studentId: string;
  detail: CheckinDetailDto;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The step shown before a NEW generation: usage limits, an optional steer for
   * this run, and the button that actually spends the credit. Skipped when a
   * draft already exists — opening then shows the draft directly, and "Gerar de
   * novo" is what brings this step back so the coach can adjust the steer.
   */
  const [composing, setComposing] = useState(false);
  const [instructions, setInstructions] = useState("");

  const evaluation = useQuery({
    queryKey: ["coach-checkin-evaluation", studentId, detail.id],
    queryFn: () =>
      apiFetch<{ evaluation: AiEvaluationDto | null }>(
        `/api/students/${studentId}/checkin/${detail.id}/evaluation`,
      ).then((r) => r.evaluation),
  });
  const usage = useQuery({
    queryKey: ["coach-plan-usage"],
    queryFn: () => apiFetch<PlanUsageDto>("/api/coach/plan-usage"),
  });
  const anamnesis = useQuery({
    queryKey: ["student-anamnesis", studentId],
    queryFn: () =>
      apiFetch<{ anamnesis: StudentAnamnesisDto | null }>(
        `/api/students/${studentId}/anamnesis`,
      ).then((r) => r.anamnesis),
  });

  const draft =
    evaluation.data && evaluation.data.status === "pending"
      ? evaluation.data
      : null;

  // Seeded from the draft, then owned by the coach. Adjusting state during
  // render rather than in an effect — the same pattern `DateInput` uses when a
  // value arrives from outside.
  const [seed, setSeed] = useState<string | null>(null);
  const [bodyFat, setBodyFat] = useState("");
  const [lean, setLean] = useState("");
  const [body, setBody] = useState("");
  if (draft && draft.id !== seed) {
    setSeed(draft.id);
    setBodyFat(draft.bodyFatPct === null ? "" : formatCheckinWeight(draft.bodyFatPct));
    setLean(draft.leanMassPct === null ? "" : formatCheckinWeight(draft.leanMassPct));
    setBody(defaultNoteBody(draft.payload));
  }

  /** Keeps the pair adding to 100. A blank on either side blanks both. */
  function setPair(next: string, from: "fat" | "lean") {
    const parsed = Number(next.trim().replace(",", "."));
    const valid = next.trim() !== "" && Number.isFinite(parsed);
    if (from === "fat") {
      setBodyFat(next);
      setLean(valid ? formatCheckinWeight(round1(100 - parsed)) : "");
    } else {
      setLean(next);
      setBodyFat(valid ? formatCheckinWeight(round1(100 - parsed)) : "");
    }
  }

  const run = useMutation({
    mutationFn: () =>
      apiFetch<AiEvaluationRunDto>(
        `/api/students/${studentId}/checkin/${detail.id}/evaluation`,
        {
          method: "POST",
          body: JSON.stringify({
            instructions: instructions.trim() === "" ? null : instructions.trim(),
          }),
          // `apiFetch`'s 15s default is sized for ordinary CRUD and is far too
          // short here: this call uploads four photos to a vision model and the
          // server gives the provider 90s. Measured runs land at 9-10s, which is
          // close enough to 15s that a slower model or a busier host would have
          // the browser abort while the server finishes — spending the credit
          // and showing the coach a timeout. Same fix, same reason, as the
          // program generator (`ai-generate-button.tsx`).
          signal: AbortSignal.timeout(120_000),
        },
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(
        ["coach-checkin-evaluation", studentId, detail.id],
        result.evaluation,
      );
      // The credit is spent whether or not the coach keeps the answer.
      queryClient.invalidateQueries({ queryKey: ["coach-plan-usage"] });
      setComposing(false);
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : "Não foi possível avaliar."),
  });

  const accept = useMutation({
    mutationFn: () =>
      apiFetch(
        `/api/students/${studentId}/checkin/${detail.id}/evaluation/accept`,
        {
          method: "POST",
          body: JSON.stringify({
            bodyFatPct: bodyFat.trim() === "" ? null : Number(bodyFat.replace(",", ".")),
            body,
          }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["coach-checkin-evaluation", studentId, detail.id],
      });
      // The accepted percentage lands on the assessment and on the chart, and
      // the note appears on the Notas tab — all three are now stale.
      queryClient.invalidateQueries({
        queryKey: ["coach-checkin", studentId, detail.id],
      });
      queryClient.invalidateQueries({ queryKey: ["coach-evolution", studentId] });
      queryClient.invalidateQueries({ queryKey: ["student-notes", studentId] });
      close();
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : "Não foi possível salvar."),
  });

  const discard = useMutation({
    mutationFn: () =>
      apiFetch(`/api/students/${studentId}/checkin/${detail.id}/evaluation`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["coach-checkin-evaluation", studentId, detail.id],
      });
      close();
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : "Não foi possível descartar."),
  });

  function close() {
    setOpen(false);
    setError(null);
    setComposing(false);
    setInstructions("");
  }

  function evaluate() {
    setError(null);
    run.mutate();
  }

  const used = usage.data?.ai.used ?? 0;
  const limit = usage.data?.ai.limit ?? null;
  // Disabled WITH the reason, never hidden: a missing anamnese is the most
  // common blocker and also the thing the coach can fix in one click, so hiding
  // the button would hide the fix.
  const blocked =
    anamnesis.data?.status !== "completed"
      ? "Este aluno precisa de uma anamnese preenchida."
      : limit !== null && used >= limit
        ? "Você já usou todas as gerações de IA deste mês."
        : null;

  const busy = run.isPending;
  const sourceLabel = draft
    ? bodyFatSourceLabel(draft.bodyFatSource, draft.confidence)
    : null;

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <h3 className="font-heading text-body font-semibold">
              Avaliação com IA
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {blocked ??
              (draft
                ? "Avaliação pendente — aceite ou descarte."
                : `Lê peso, medidas, fotos e histórico. ${formatAiUsage(used, limit)}.`)}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || anamnesis.isLoading || (!draft && blocked !== null)}
          onClick={() => {
            setOpen(true);
            // With no draft there is nothing to show but the form (usage,
            // steer, the button that spends the credit) — "Gerar de novo" is
            // what brings this same step back once a draft exists.
            if (!draft) setComposing(true);
          }}
        >
          {busy ? "Avaliando…" : draft ? "Ver avaliação" : "Avaliar com IA"}
        </Button>
      </section>

      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading text-lg">
              <Sparkles className="size-4 text-primary" />
              Avaliação com IA
            </DialogTitle>
            <p className="text-body-dense text-muted-foreground">
              {formatCheckinDate(detail.date)}
              {detail.weightKg !== null
                ? ` · ${formatCheckinWeight(detail.weightKg)} kg`
                : ""}
            </p>
          </DialogHeader>

          {busy ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Lendo o check-in e as fotos…
            </p>
          ) : composing ? (
            <div className="flex flex-col gap-3">
              {/* Regenerating replaces the draft, so it says so up front — same
                  rule the program generator follows for an existing draft. */}
              {draft && (
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-body-dense text-muted-foreground">
                  Isso substitui a avaliação pendente.
                </p>
              )}

              <div className="space-y-1">
                <Label
                  htmlFor="eval-instructions"
                  className="text-caption font-medium text-muted-foreground"
                >
                  Instruções extras (opcional)
                </Label>
                <Textarea
                  id="eval-instructions"
                  rows={4}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  maxLength={500}
                  placeholder="Ex.: focar na evolução da cintura, aluno relatou dor no ombro…"
                />
                <p className="text-xs text-muted-foreground">
                  Lida pela IA só nesta avaliação — não vira nota nem é o que o
                  aluno recebe.
                </p>
              </div>

              {/* The limit the server itself will check before spending a
                  credit — shown here, not just on the trigger, because this is
                  where the coach decides whether to press the button. */}
              <p className="text-body-dense text-muted-foreground">
                {formatAiUsage(used, limit)}.
              </p>
              {blocked && (
                <p className="text-body-dense text-destructive">{blocked}</p>
              )}
              {error && (
                <p className="text-body-dense text-destructive">{error}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <Button
                  type="button"
                  size="sm"
                  disabled={blocked !== null}
                  onClick={evaluate}
                >
                  <Sparkles className="size-4" />
                  Avaliar com IA
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={close}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : draft ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-caption font-semibold text-primary">
                  {EVALUATION_VERDICT_LABELS[draft.payload.verdict]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {EVALUATION_VERDICT_HINTS[draft.payload.verdict]}
                </span>
              </div>

              <p className="text-body-dense text-foreground">
                {draft.payload.summary}
              </p>

              {draft.bodyFatPct === null ? (
                /* An honest "I could not tell" — never a number invented to
                   fill the field. The reason is the model's own words. */
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-body-dense text-muted-foreground">
                  Sem % de gordura:{" "}
                  {draft.payload.unavailable ?? "não foi possível estimar."}
                </p>
              ) : (
                <div>
                  <div className="grid grid-cols-2 gap-3 sm:max-w-[320px]">
                    <div className="space-y-1">
                      <Label
                        htmlFor="eval-bf"
                        className="text-caption font-medium text-muted-foreground"
                      >
                        % de gordura
                      </Label>
                      <Input
                        id="eval-bf"
                        inputMode="decimal"
                        value={bodyFat}
                        onChange={(e) => setPair(e.target.value, "fat")}
                        className="h-9 px-2.5 text-body-dense"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor="eval-lean"
                        className="text-caption font-medium text-muted-foreground"
                      >
                        Massa magra %
                      </Label>
                      <Input
                        id="eval-lean"
                        inputMode="decimal"
                        value={lean}
                        onChange={(e) => setPair(e.target.value, "lean")}
                        className="h-9 px-2.5 text-body-dense"
                      />
                    </div>
                  </div>
                  {sourceLabel && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Origem: {sourceLabel}.
                      {draft.leanMassKg !== null
                        ? ` Massa magra ${formatCheckinWeight(draft.leanMassKg)} kg.`
                        : ""}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <Label
                  htmlFor="eval-body"
                  className="text-caption font-medium text-muted-foreground"
                >
                  Nota (só o coach vê)
                </Label>
                <Textarea
                  id="eval-body"
                  rows={8}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                {/* The one thing a coach might assume and must not: this text is
                    theirs, and the aluno never receives it. */}
                <p className="text-xs text-muted-foreground">
                  Salva em Notas do aluno. O aluno não vê esta nota nem esta
                  avaliação.
                </p>
              </div>

              {error && (
                <p className="text-body-dense text-destructive">{error}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <Button
                  type="button"
                  size="sm"
                  disabled={accept.isPending || body.trim() === ""}
                  onClick={() => {
                    setError(null);
                    accept.mutate();
                  }}
                >
                  <Check className="size-4" />
                  {accept.isPending ? "Salvando…" : "Aceitar e salvar nota"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={discard.isPending}
                  onClick={() => discard.mutate()}
                >
                  Descartar
                </Button>
                {/* Back to the instructions step — the same one a first-ever
                    generation goes through, with the pending draft named as
                    what gets replaced. */}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setError(null);
                    setComposing(true);
                  }}
                >
                  Gerar de novo
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma avaliação pendente.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Edits an existing check-in: date, weight, note, measures and photos — the
 * whole entry, whether the aluno submitted it or the coach logged it. A coach
 * owns the clinical record: a weight typed with the decimal in the wrong place,
 * an import filed under the wrong day or a photo shot in the wrong pose should
 * be correctable in place, not by deleting and re-entering.
 *
 * Photos follow the same three rules the API does: a slot with a new file is
 * replaced, a slot cleared is dropped, and a slot left alone is untouched — so
 * fixing a weight never re-uploads four images. Clearing every measure removes
 * the assessment.
 */
function EditCheckinForm({
  studentId,
  detail,
  onDone,
}: {
  studentId: string;
  detail: CheckinDetailDto;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const basePath = `/api/students/${studentId}/checkin/${detail.id}/photo`;
  const { photos, pick, remove, reset: resetPhotos } = usePhotoSlots();
  const preset = useDefaultPreset();
  const [assessment, setAssessment] = useState<AssessmentFormValues>(() =>
    detail.assessment
      ? assessmentFormFromDto(detail.assessment)
      : emptyAssessmentForm(preset),
  );
  const [showAssessment, setShowAssessment] = useState(
    detail.assessment !== null,
  );
  // Poses whose STORED photo the coach dropped (a new pick isn't a removal).
  const [dropped, setDropped] = useState<CheckinPose[]>([]);
  const [progress, setProgress] = useState(0);

  const storedByPose = new Map(detail.photos.map((p) => [p.pose, p.id]));
  const today = todayYmd();

  const mutation = useMutation({
    mutationFn: (fd: FormData) =>
      uploadCheckinForm<CheckinDetailDto>(
        `/api/students/${studentId}/checkin/${detail.id}`,
        fd,
        setProgress,
        "PATCH",
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["coach-checkin", studentId, detail.id],
      });
      queryClient.invalidateQueries({ queryKey: ["coach-checkins", studentId] });
      queryClient.invalidateQueries({ queryKey: ["coach-evolution", studentId] });
      queryClient.invalidateQueries({ queryKey: ["coach-dashboard"] });
      onDone();
    },
  });

  const form = useForm({
    defaultValues: {
      date: detail.date,
      modality: detail.modality,
      weightKg: detail.weightKg === null ? "" : formatCheckinWeight(detail.weightKg),
      note: detail.note ?? "",
    },
    validators: { onChange: coachCheckinSchema },
    onSubmit: async ({ value }) => {
      const fd = new FormData();
      fd.set("date", value.date);
      fd.set("modality", value.modality);
      fd.set("weightKg", value.weightKg.trim());
      fd.set("note", value.note.trim());
      fd.set(
        "assessment",
        JSON.stringify(
          assessmentFormHasValues(assessment)
            ? assessmentFormToPayload(assessment)
            : {},
        ),
      );
      // Only poses the coach actually cleared — a pose that got a new file is a
      // replacement, which the API handles from the file alone.
      fd.set(
        "removePhotos",
        dropped.filter((pose) => photos[pose] === null).join(","),
      );
      appendPhotos(fd, photos);
      setProgress(0);
      try {
        await mutation.mutateAsync(fd);
      } catch {
        /* surfaced below */
      }
    },
  });

  const banner =
    mutation.error instanceof ApiError ? mutation.error.message : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <form.Field name="date">
        {(field) => (
          <DateInput
            id="e-date"
            label="Data do check-in"
            value={field.state.value}
            onChange={(v) => field.handleChange(v)}
            onBlur={field.handleBlur}
            error={fieldError(field)}
            min={CHECKIN_MIN_DATE}
            max={today}
          />
        )}
      </form.Field>

      {/* An aluno submission arrived through the portal — that is a fact about
          how it got here, not a judgement call, so only a coach's own entry
          exposes the choice. The stored value rides along untouched either way. */}
      {detail.author === "coach" ? (
        <form.Field name="modality">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="e-modality">Modalidade</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as Modality)}
              >
                <SelectTrigger id="e-modality" onBlur={field.handleBlur}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODALITY_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {MODALITY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
      ) : null}

      <form.Field name="weightKg">
        {(field) => (
          <Field
            id="e-weight"
            label="Peso (kg) — opcional"
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

      <form.Field name="note">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="e-note">
              {detail.author === "student"
                ? "Observação do aluno"
                : "Feedback / observação"}
            </Label>
            <Textarea
              id="e-note"
              rows={3}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <div className="space-y-2">
        <Label>Fotos</Label>
        <div className="grid grid-cols-4 gap-2.5">
          {CHECKIN_POSE_VALUES.map((pose) => {
            const storedId = storedByPose.get(pose);
            const showStored =
              storedId !== undefined && !dropped.includes(pose);
            return (
              <PhotoUploadSlot
                key={pose}
                pose={pose}
                slot={photos[pose]}
                existingUrl={showStored ? `${basePath}/${storedId}` : undefined}
                disabled={mutation.isPending}
                onPick={(file) => pick(pose, file)}
                onRemove={() => {
                  if (photos[pose]) remove(pose);
                  else setDropped((d) => [...d, pose]);
                }}
              />
            );
          })}
        </div>
      </div>

      {showAssessment ? (
        <div className="rounded-xl border border-border p-3.5">
          <AssessmentFields
            value={assessment}
            onChange={setAssessment}
            idPrefix="edit"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Apagar todos os campos remove as medidas deste check-in.
          </p>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setShowAssessment(true)}
        >
          <Ruler className="size-4" />
          Registrar medidas (opcional)
        </Button>
      )}

      {banner ? (
        <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
          {banner}
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2.5">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            resetPhotos();
            setDropped([]);
            onDone();
          }}
          disabled={mutation.isPending}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={anySlotCompressing(photos) || mutation.isPending}
        >
          {mutation.isPending
            ? `Salvando…${progress > 0 && progress < 100 ? ` ${progress}%` : ""}`
            : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The check-in's photos, with a pose selector under each one.
 *
 * Uploading "lado esquerdo" into the "lado direito" slot is the single most
 * common mistake on a check-in — by the aluno at submit time or by the coach on
 * an in-person entry — and it silently corrupts the before/after comparison,
 * which lines photos up BY POSE. Fixing it here costs one dropdown; the
 * alternative is asking the aluno to shoot and submit the whole set again.
 *
 * Choosing a pose another photo already holds swaps the two, so the fix is a
 * single action rather than a three-step shuffle through a free slot.
 */
function CheckinPhotos({
  studentId,
  detail,
}: {
  studentId: string;
  detail: CheckinDetailDto;
}) {
  const queryClient = useQueryClient();

  const reassign = useMutation({
    mutationFn: ({ photoId, pose }: { photoId: string; pose: CheckinPose }) =>
      apiFetch<{ photos: CheckinDetailDto["photos"] }>(
        `/api/students/${studentId}/checkin/${detail.id}/photo/${photoId}`,
        { method: "PATCH", body: JSON.stringify({ pose }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["coach-checkin", studentId, detail.id],
      });
      // Evolução lines the before/after photos up by pose — it is the view the
      // mix-up actually broke.
      queryClient.invalidateQueries({ queryKey: ["coach-evolution", studentId] });
    },
  });

  const banner =
    reassign.error instanceof ApiError ? reassign.error.message : undefined;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-xs font-medium text-muted-foreground">
          Fotos do aluno
        </span>
        <span className="text-xs text-muted-foreground">
          Trocou de lado? Corrija a pose abaixo da foto.
        </span>
      </div>
      <CheckinPhotoGrid
        basePath={`/api/students/${studentId}/checkin/${detail.id}/photo`}
        photos={detail.photos}
        reassigning={reassign.isPending}
        onReassign={(photoId, pose) => reassign.mutate({ photoId, pose })}
      />
      {banner ? (
        <p className="mt-2 text-body-dense font-medium text-destructive">
          {banner}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Permanently removes a check-in. Two-step on purpose: destroying a student's
 * weight, photos and measures is irreversible and there is no archive to undo
 * it, so the button only arms the confirmation — which names the date, since a
 * timeline of similar entries is exactly where the wrong one gets picked.
 */
function DeleteCheckin({
  studentId,
  detail,
  onDeleted,
}: {
  studentId: string;
  detail: CheckinDetailDto;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>(
        `/api/students/${studentId}/checkin/${detail.id}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      queryClient.removeQueries({
        queryKey: ["coach-checkin", studentId, detail.id],
      });
      queryClient.invalidateQueries({ queryKey: ["coach-checkins", studentId] });
      queryClient.invalidateQueries({ queryKey: ["coach-evolution", studentId] });
      queryClient.invalidateQueries({ queryKey: ["coach-dashboard"] });
      onDeleted();
    },
  });

  const banner =
    remove.error instanceof ApiError ? remove.error.message : undefined;

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" />
        Excluir check-in
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3">
      <p className="text-body-dense text-foreground">
        Excluir o check-in de{" "}
        <span className="font-semibold">{formatCheckinDate(detail.date)}</span>?
        Peso, fotos, medidas e feedback são apagados para sempre — não há como
        desfazer.
      </p>
      {banner ? (
        <p className="text-body-dense font-medium text-destructive">{banner}</p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={remove.isPending}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          className="bg-destructive text-white hover:bg-destructive/90"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
        >
          <Trash2 className="size-4" />
          {remove.isPending ? "Excluindo…" : "Excluir definitivamente"}
        </Button>
      </div>
    </div>
  );
}

/** The feedback + optional-assessment form; state seeds from `detail` on mount. */
function ReviewForm({
  studentId,
  detail,
  onClose,
}: {
  studentId: string;
  detail: CheckinDetailDto;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState(detail.feedback ?? "");
  const preset = useDefaultPreset();
  const [assessment, setAssessment] = useState<AssessmentFormValues>(() =>
    detail.assessment
      ? assessmentFormFromDto(detail.assessment)
      : emptyAssessmentForm(preset),
  );
  const [showAssessment, setShowAssessment] = useState(detail.assessment !== null);

  const submit = useMutation({
    mutationFn: () =>
      apiFetch<CheckinDetailDto>(
        `/api/students/${studentId}/checkin/${detail.id}/feedback`,
        {
          method: "POST",
          body: JSON.stringify({
            feedback,
            assessment: assessmentFormHasValues(assessment)
              ? assessmentFormToPayload(assessment)
              : undefined,
          }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-checkins", studentId] });
      queryClient.invalidateQueries({ queryKey: ["coach-evolution", studentId] });
      queryClient.invalidateQueries({
        queryKey: ["coach-checkin", studentId, detail.id],
      });
      onClose();
    },
  });

  const banner =
    submit.error instanceof ApiError ? submit.error.message : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (feedback.trim()) submit.mutate();
      }}
      className="flex flex-col gap-3 border-t border-border pt-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="feedback">Seu feedback</Label>
        <Textarea
          id="feedback"
          rows={4}
          placeholder="Ótima evolução! Vamos ajustar o descanso do supino…"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Enviado ao aluno no portal e no WhatsApp.
        </p>
      </div>

      {showAssessment ? (
        <div className="rounded-xl border border-border p-3.5">
          <AssessmentFields
            value={assessment}
            onChange={setAssessment}
            idPrefix="review"
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setShowAssessment(true)}
        >
          <Ruler className="size-4" />
          Registrar medidas (opcional)
        </Button>
      )}

      {banner ? (
        <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
          {banner}
        </div>
      ) : null}

      <div className="flex justify-end gap-2.5">
        <Button type="button" variant="outline" onClick={onClose}>
          Fechar
        </Button>
        <Button type="submit" disabled={!feedback.trim() || submit.isPending}>
          <MessageCircle className="size-4" />
          {submit.isPending
            ? "Enviando…"
            : detail.feedbackAt
              ? "Atualizar feedback"
              : "Enviar feedback"}
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Manual (in-person) check-in dialog                                         */
/* -------------------------------------------------------------------------- */

function ManualCheckinDialog({
  studentId,
  open,
  existingDates,
  onClose,
}: {
  studentId: string;
  open: boolean;
  /** Dates already on the timeline — only to warn, never to block. */
  existingDates: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { photos, pick, remove, reset: resetPhotos } = usePhotoSlots();
  const preset = useDefaultPreset();
  const [assessment, setAssessment] = useState<AssessmentFormValues>(
    emptyAssessmentForm(preset),
  );
  const [showAssessment, setShowAssessment] = useState(false);
  const [progress, setProgress] = useState(0);
  // Set by "Salvar e adicionar outro" just before submit, so the same handler
  // knows whether to close or to clear itself for the next entry.
  const keepOpen = useRef(false);
  // The date of the last entry saved without closing — the only feedback that a
  // long import is actually landing.
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const today = todayYmd();

  const mutation = useMutation({
    mutationFn: (fd: FormData) =>
      uploadCheckinForm<CheckinDto>(
        `/api/students/${studentId}/checkin`,
        fd,
        setProgress,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-checkins", studentId] });
      queryClient.invalidateQueries({ queryKey: ["coach-evolution", studentId] });
      queryClient.invalidateQueries({ queryKey: ["coach-dashboard"] });
    },
  });

  const form = useForm({
    defaultValues: {
      date: today,
      modality: COACH_CHECKIN_DEFAULT_MODALITY,
      weightKg: "",
      note: "",
    },
    validators: { onChange: coachCheckinSchema },
    onSubmit: async ({ value }) => {
      const fd = new FormData();
      fd.set("date", value.date);
      fd.set("modality", value.modality);
      if (value.weightKg.trim()) fd.set("weightKg", value.weightKg);
      if (value.note.trim()) fd.set("note", value.note);
      if (assessmentFormHasValues(assessment)) {
        fd.set("assessment", JSON.stringify(assessmentFormToPayload(assessment)));
      }
      appendPhotos(fd, photos);
      setProgress(0);
      try {
        await mutation.mutateAsync(fd);
      } catch {
        return; // surfaced in the banner below
      }
      if (keepOpen.current) {
        setLastSaved(value.date);
        clearForNext();
      } else {
        close();
      }
    },
  });

  /**
   * Clears everything the next imported entry must not inherit, but keeps the
   * date: importing a year of history means typing a date every time, and
   * auto-advancing it would invent one the coach never chose.
   */
  function clearForNext() {
    resetPhotos();
    setAssessment(emptyAssessmentForm());
    setShowAssessment(false);
    setProgress(0);
    mutation.reset();
    form.setFieldValue("weightKg", "");
    form.setFieldValue("note", "");
    // Date and modality carry over: a batch of imported entries is normally the
    // same kind, and re-picking both for every one would be the tax that makes
    // an import not worth doing.
    document.getElementById("m-date")?.focus();
  }

  function close() {
    resetPhotos();
    setAssessment(emptyAssessmentForm());
    setShowAssessment(false);
    setProgress(0);
    setLastSaved(null);
    mutation.reset();
    form.reset();
    onClose();
  }

  const banner =
    mutation.error instanceof ApiError ? mutation.error.message : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-lg">
            <ClipboardList className="size-5 text-primary" />
            Novo check-in
          </DialogTitle>
          <p className="text-body-dense text-muted-foreground">
            Presencial por padrão; mude para Online se o aluno passou os dados
            por outro canal. Use a data de hoje para uma avaliação agora, ou uma
            data passada para importar um check-in antigo — só um check-in de
            hoje avisa o aluno no WhatsApp.
          </p>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <form.Field name="date">
            {(field) => (
              <div className="space-y-1.5">
                <DateInput
                  id="m-date"
                  label="Data do check-in"
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v)}
                  onBlur={field.handleBlur}
                  error={fieldError(field)}
                  min={CHECKIN_MIN_DATE}
                  max={today}
                />
                {existingDates.includes(field.state.value) ? (
                  <p className="text-body-dense text-muted-foreground">
                    Já existe um check-in nesta data. Pode salvar assim mesmo — a
                    avaliação presencial do dia em que o aluno enviou o check-in
                    online é uma dupla legítima.
                  </p>
                ) : null}
              </div>
            )}
          </form.Field>

          <form.Field name="modality">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="m-modality">Modalidade</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as Modality)}
                >
                  <SelectTrigger id="m-modality" onBlur={field.handleBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODALITY_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {MODALITY_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Field name="weightKg">
            {(field) => (
              <Field
                id="m-weight"
                label="Peso (kg) — opcional"
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

          <form.Field name="note">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="m-note">Feedback / observação</Label>
                <Textarea
                  id="m-note"
                  rows={3}
                  placeholder="Avaliação presencial. Cintura −2 cm no mês…"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>

          {/* Optional photos */}
          <div className="space-y-2">
            <Label>Fotos (opcional)</Label>
            <div className="grid grid-cols-4 gap-2.5">
              {CHECKIN_POSE_VALUES.map((pose) => (
                <PhotoUploadSlot
                  key={pose}
                  pose={pose}
                  slot={photos[pose]}
                  disabled={mutation.isPending}
                  onPick={(file) => pick(pose, file)}
                  onRemove={() => remove(pose)}
                />
              ))}
            </div>
          </div>

          {/* Optional assessment */}
          {showAssessment ? (
            <div className="rounded-xl border border-border p-3.5">
              <AssessmentFields
                value={assessment}
                onChange={setAssessment}
                idPrefix="manual"
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setShowAssessment(true)}
            >
              <Ruler className="size-4" />
              Registrar medidas (opcional)
            </Button>
          )}

          {banner ? (
            <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
              {banner}
            </div>
          ) : null}

          {mutation.isPending ? (
            <div
              className="space-y-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label="Salvando check-in"
            >
              <div className="flex items-center justify-between text-body-dense font-medium text-foreground">
                <span>{progress < 100 ? "Salvando…" : "Finalizando…"}</span>
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
            <div className="flex flex-col gap-2.5">
              {lastSaved ? (
                <p className="text-body-dense text-primary">
                  Check-in de {formatCheckinDate(lastSaved)} salvo. Informe a
                  data do próximo.
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2.5">
                <Button type="button" variant="outline" onClick={close}>
                  Cancelar
                </Button>
                {/* Importing history means many entries in a row; reopening the
                    dialog for each one is the difference between a usable
                    import and a miserable one. */}
                <Button
                  type="submit"
                  variant="outline"
                  disabled={anySlotCompressing(photos)}
                  onClick={() => {
                    keepOpen.current = true;
                  }}
                >
                  Salvar e adicionar outro
                </Button>
                <Button
                  type="submit"
                  disabled={anySlotCompressing(photos)}
                  onClick={() => {
                    keepOpen.current = false;
                  }}
                >
                  Salvar check-in
                </Button>
              </div>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
