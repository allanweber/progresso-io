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
  Plus,
  Ruler,
  Trash2,
} from "lucide-react";

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
import { Label } from "@/components/ui/label";
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
import { apiFetch, ApiError } from "@/lib/api-client";
import { todayYmd } from "@/lib/calendar";
import { fieldError } from "@/lib/form";
import {
  CHECKIN_MIN_DATE,
  CHECKIN_POSE_VALUES,
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
  // A coach entry with measures/photos/weight reads as an in-person assessment;
  // a note-only coach entry is a plain annotation.
  if (c.hasAssessment || c.photoCount > 0 || c.weightKg !== null) {
    return {
      title: "Avaliação presencial",
      tag: "presencial",
      className: "bg-amber-100 text-amber-700 dark:bg-amber-950/40",
    };
  }
  return {
    title: "Anotação do coach",
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
        className="w-full rounded-2xl border border-border bg-white p-4 text-left shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:border-primary/40 dark:bg-card"
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
  const detail = useQuery({
    queryKey: ["coach-checkin", studentId, checkinId],
    queryFn: () =>
      apiFetch<CheckinDetailDto>(
        `/api/students/${studentId}/checkin/${checkinId}`,
      ),
    enabled: checkinId !== null,
  });

  const d = detail.data;

  return (
    <Dialog open={checkinId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            {!d
              ? "Check-in"
              : d.author === "student"
                ? "Check-in do aluno"
                : d.weightKg !== null || d.photos.length > 0 || d.assessment
                  ? "Avaliação presencial"
                  : "Anotação do coach"}
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
        ) : d ? (
          <div className="flex flex-col gap-4">
            {d.note ? (
              <div className="rounded-xl bg-muted/40 px-3.5 py-3 text-body-dense text-foreground">
                {d.note}
              </div>
            ) : null}

            {d.photos.length > 0 ? (
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Fotos do aluno
                </div>
                <CheckinPhotoGrid
                  basePath={`/api/students/${studentId}/checkin/${d.id}/photo`}
                  photos={d.photos}
                />
              </div>
            ) : null}

            {d.assessment ? <AssessmentView assessment={d.assessment} /> : null}

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

            <DeleteCheckin
              key={`del-${d.id}`}
              studentId={studentId}
              detail={d}
              onDeleted={onClose}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
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
      <div className="border-t border-border pt-3">
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3">
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
  const [assessment, setAssessment] = useState<AssessmentFormValues>(() =>
    detail.assessment
      ? assessmentFormFromDto(detail.assessment)
      : emptyAssessmentForm(),
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
  const [assessment, setAssessment] = useState<AssessmentFormValues>(
    emptyAssessmentForm(),
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
    defaultValues: { date: today, weightKg: "", note: "" },
    validators: { onChange: coachCheckinSchema },
    onSubmit: async ({ value }) => {
      const fd = new FormData();
      fd.set("date", value.date);
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
            Novo check-in presencial
          </DialogTitle>
          <p className="text-body-dense text-muted-foreground">
            Use a data de hoje para uma avaliação agora, ou uma data passada para
            importar um check-in antigo. Só um check-in de hoje avisa o aluno no
            WhatsApp.
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
