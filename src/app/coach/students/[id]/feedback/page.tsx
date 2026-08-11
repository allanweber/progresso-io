"use client";

import { useState } from "react";
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
} from "lucide-react";

import { StudentTabs } from "@/components/students/student-tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  anyCompressing as anySlotCompressing,
  appendPhotos,
  CheckinPhotoGrid,
  PhotoUploadSlot,
  uploadCheckinForm,
  usePhotoSlots,
} from "@/components/checkins/photo-upload";
import { apiFetch, ApiError } from "@/lib/api-client";
import { fieldError } from "@/lib/form";
import {
  CHECKIN_POSE_VALUES,
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
        className="text-[13px] text-[#94A3B8] transition-colors hover:text-primary"
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
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11.5px] font-semibold text-destructive">
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
        className="w-full rounded-2xl border border-border bg-white p-4 text-left shadow-[0_1px_8px_rgba(15,23,42,0.06)] transition-colors hover:border-primary/40 dark:bg-card"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{style.title}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.className}`}
          >
            {style.tag}
          </span>
          {pending ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              <Clock className="size-3" /> aguarda resposta
            </span>
          ) : null}
          <span className="ml-auto text-[12px] text-muted-foreground">
            {formatCheckinDate(checkin.date)}
          </span>
        </div>

        {checkin.weightKg !== null ? (
          <div className="mt-1.5 text-[12.5px] font-semibold text-primary">
            Peso: {formatCheckinWeight(checkin.weightKg)} kg
          </div>
        ) : null}
        {checkin.note ? (
          <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
            {checkin.note}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
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
          <div className="mt-2.5 rounded-xl border border-primary/20 bg-primary-light/40 px-3 py-2 text-[12.5px] text-foreground">
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
            <p className="text-[12.5px] text-muted-foreground">
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
              <div className="rounded-xl bg-muted/40 px-3.5 py-3 text-[13px] text-foreground">
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
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
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
        <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
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
  onClose,
}: {
  studentId: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { photos, pick, remove, reset: resetPhotos } = usePhotoSlots();
  const [assessment, setAssessment] = useState<AssessmentFormValues>(
    emptyAssessmentForm(),
  );
  const [showAssessment, setShowAssessment] = useState(false);
  const [progress, setProgress] = useState(0);

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
      close();
    },
  });

  const form = useForm({
    defaultValues: { weightKg: "", note: "" },
    onSubmit: async ({ value }) => {
      const fd = new FormData();
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
        /* surfaced below */
      }
    },
  });

  function close() {
    resetPhotos();
    setAssessment(emptyAssessmentForm());
    setShowAssessment(false);
    setProgress(0);
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
          <p className="text-[12.5px] text-muted-foreground">
            Registrado na data de hoje. O feedback é enviado ao aluno no WhatsApp.
          </p>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
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
            <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
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
              <div className="flex items-center justify-between text-[13px] font-medium text-foreground">
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
            <div className="flex justify-end gap-2.5">
              <Button type="button" variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={anySlotCompressing(photos)}>
                Salvar check-in
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
