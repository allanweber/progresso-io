"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  MessageCircle,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StudentTabs } from "@/components/students/student-tabs";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatPhone, whatsappHref } from "@/lib/phone";
import {
  ANAMNESIS_OBJECTIVE_LABELS,
  ANAMNESIS_MODALITY_LABELS,
  type AnamnesisListResponse,
} from "@/lib/anamneses";
import {
  extractProfileMetrics,
  PROFILE_METRIC_KEYS,
  type AnamnesisAnswerValue,
  type StudentAnamnesisDto,
} from "@/lib/student-anamneses";

/** Canonical metric keys live in the Perfil card — skip them in the answers list. */
const METRIC_KEY_SET = new Set<string>(PROFILE_METRIC_KEYS);
import type { PlanUsageDto } from "@/lib/plans";
import {
  ACCESS_LABELS,
  avatarColor,
  deriveAccess,
  deriveStudentState,
  MODALITY_LABELS,
  studentInitials,
  STUDENT_STATE_STYLES,
  type StudentRosterDto,
} from "@/lib/students";

/** Renders an answer value for display (booleans → Sim/Não). */
function answerText(v: AnamnesisAnswerValue): string {
  if (v === true) return "Sim";
  if (v === false) return "Não";
  return typeof v === "string" ? v.trim() : "";
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Archiving is a paid-tier feature; Free/Solo hard-delete instead.
  const usage = useQuery({
    queryKey: ["coach-plan-usage"],
    queryFn: () => apiFetch<PlanUsageDto>("/api/coach/plan-usage"),
  });
  const canArchive = usage.data?.archive ?? true;

  const { data: student, isLoading, isError, error } = useQuery({
    queryKey: ["student", id],
    queryFn: () =>
      apiFetch<{ student: StudentRosterDto }>(`/api/students/${id}`).then(
        (r) => r.student,
      ),
  });

  const anamnesis = useQuery({
    queryKey: ["student-anamnesis", id],
    queryFn: () =>
      apiFetch<{ anamnesis: StudentAnamnesisDto | null }>(
        `/api/students/${id}/anamnesis`,
      ).then((r) => r.anamnesis),
  });

  const templates = useQuery({
    queryKey: ["anamneses", "templates"],
    queryFn: () => apiFetch<AnamnesisListResponse>("/api/anamneses?pageSize=100"),
    enabled: templateOpen,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["student", id] });
    queryClient.invalidateQueries({ queryKey: ["students"] });
  }

  const invite = useMutation({
    mutationFn: () => apiFetch(`/api/students/${id}/invite`, { method: "POST" }),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: () => apiFetch(`/api/students/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  const hardDelete = useMutation({
    mutationFn: () =>
      apiFetch(`/api/students/${id}/delete`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["coach-plan-usage"] });
      router.push("/coach/students");
    },
  });
  const reactivate = useMutation({
    mutationFn: () =>
      apiFetch(`/api/students/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      }),
    onSuccess: invalidate,
  });
  const replaceTemplate = useMutation({
    mutationFn: () =>
      apiFetch(`/api/students/${id}/anamnesis/template`, {
        method: "PUT",
        body: JSON.stringify({ anamnesisId: templateId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-anamnesis", id] });
      setTemplateOpen(false);
      setTemplateId("");
    },
  });
  const resendAnamnesis = useMutation({
    mutationFn: () =>
      apiFetch(`/api/students/${id}/anamnesis/invite`, { method: "POST" }),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }
  if (isError || !student) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link
          href="/coach/students"
          className="text-body-dense text-[#94A3B8] transition-colors hover:text-primary"
        >
          ← Alunos
        </Link>
        <p className="mt-4 text-sm text-destructive">
          {isError ? (error as Error).message : "Aluno não encontrado."}
        </p>
      </div>
    );
  }

  const state = deriveStudentState(student);
  const style = STUDENT_STATE_STYLES[state.key];
  const busy = invite.isPending || archive.isPending || reactivate.isPending;
  const wa = whatsappHref(student.phone);

  const am = anamnesis.data;
  const metrics = extractProfileMetrics(am?.answers);
  const filledLabel =
    am?.status === "completed"
      ? am.filledBy === "aluno"
        ? "Preenchida pelo aluno"
        : "Preenchida pelo coach"
      : "Pendente";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/coach/students"
        className="text-body-dense text-[#94A3B8] transition-colors hover:text-primary"
      >
        ← Alunos
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-xl font-semibold text-white"
          style={{ background: avatarColor(student.id) }}
        >
          {studentInitials(student.firstName, student.lastName)}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold text-foreground">
              {student.firstName} {student.lastName}
            </h1>
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ color: style.color, background: style.bg }}
            >
              {state.label}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {student.goal ?? MODALITY_LABELS[student.modality]}
            {" · "}
            {student.email ?? formatPhone(student.phone) ?? "—"}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        <Button asChild variant="outline">
          <Link href={`/coach/students/${student.id}/edit`}>
            <Pencil className="size-4" />
            Editar
          </Link>
        </Button>

        {wa && (
          <Button asChild variant="outline">
            <a href={wa} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
          </Button>
        )}

        {student.modality === "online" &&
          !student.hasAccount &&
          student.status !== "archived" && (
            <Button onClick={() => invite.mutate()} disabled={busy}>
              <Send className="size-4" />
              {invite.isPending
                ? "Enviando…"
                : student.pendingInvite
                  ? "Reenviar convite"
                  : "Enviar convite"}
            </Button>
          )}

        {student.status === "archived" ? (
          <Button variant="outline" onClick={() => reactivate.mutate()} disabled={busy}>
            <RotateCcw className="size-4" />
            Reativar
          </Button>
        ) : canArchive ? (
          <Button variant="outline" onClick={() => archive.mutate()} disabled={busy}>
            <Archive className="size-4" />
            Arquivar
          </Button>
        ) : (
          // Free/Solo can't archive — the only removal is a permanent delete.
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={busy}
          >
            <Trash2 className="size-4" />
            Excluir
          </Button>
        )}
      </div>

      {invite.isSuccess && (
        <p className="mt-3 text-body-dense font-medium text-primary">
          Convite enviado por WhatsApp
          {student.email ? " e e-mail" : ""}.
        </p>
      )}
      {(invite.isError || archive.isError || reactivate.isError) && (
        <p className="mt-3 text-body-dense font-medium text-destructive">
          {
            ((invite.error ?? archive.error ?? reactivate.error) as ApiError)
              .message
          }
        </p>
      )}

      {/* Permanent-delete confirmation (Free/Solo only). */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir aluno</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Excluir{" "}
              <span className="font-medium text-foreground">
                {student.firstName} {student.lastName}
              </span>{" "}
              permanentemente? Todo o histórico (dietas, treinos, check-ins) e o
              acesso do aluno serão removidos. Esta ação não pode ser desfeita.
              Arquivar alunos está disponível nos planos pagos.
            </p>
            {hardDelete.error instanceof ApiError ? (
              <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
                {hardDelete.error.message}
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
                disabled={hardDelete.isPending}
                onClick={() => hardDelete.mutate()}
              >
                {hardDelete.isPending ? "Excluindo…" : "Excluir permanentemente"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mt-6">
        <StudentTabs studentId={student.id} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Perfil */}
        <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <h2 className="font-heading text-base font-semibold text-foreground">
            Perfil
          </h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            {[
              { label: "Objetivo", value: student.goal ?? "—" },
              { label: "Modalidade", value: MODALITY_LABELS[student.modality] },
              { label: "Acesso", value: ACCESS_LABELS[deriveAccess(student)] },
              ...metrics.map((m) => ({ label: m.label, value: m.value })),
              { label: "E-mail", value: student.email ?? "—" },
              { label: "WhatsApp", value: formatPhone(student.phone) || "—" },
            ].map((d) => (
              <div key={d.label} className="contents">
                <dt className="text-[#94A3B8]">{d.label}</dt>
                <dd className="font-medium text-foreground">{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Anamnese */}
        <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-base font-semibold text-foreground">
              Anamnese
            </h2>
            <Badge variant={am?.status === "completed" ? "clinic" : "warn"}>
              {filledLabel}
            </Badge>
          </div>

          {anamnesis.isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
          ) : !am ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhuma anamnese atribuída.
            </p>
          ) : (
            <>
              <p className="mt-2 text-body-dense text-muted-foreground">{am.name}</p>
              {am.status === "completed" ? (
                <dl className="mt-4 space-y-3 text-sm">
                  {am.sections.flatMap((s) =>
                    s.questions
                      .filter(
                        (q) =>
                          !METRIC_KEY_SET.has(q.key) &&
                          answerText(am.answers[q.key]),
                      )
                      .map((q) => (
                        <div key={q.key}>
                          <dt className="text-[#94A3B8]">{q.label}</dt>
                          <dd className="font-medium text-foreground">
                            {answerText(am.answers[q.key])}
                          </dd>
                        </div>
                      )),
                  )}
                </dl>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  A anamnese ainda não foi preenchida.
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-2.5 border-t border-border pt-4">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/coach/students/${student.id}/anamnesis`}>
                    <Pencil className="size-4" />
                    {am.status === "completed" ? "Editar" : "Preencher"}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTemplateId("");
                    setTemplateOpen(true);
                  }}
                >
                  <RefreshCw className="size-4" />
                  Trocar template
                </Button>
                {am.status !== "completed" &&
                  student.modality === "online" &&
                  student.phone &&
                  student.status !== "archived" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => resendAnamnesis.mutate()}
                      disabled={resendAnamnesis.isPending}
                    >
                      <Send className="size-4" />
                      {resendAnamnesis.isPending
                        ? "Enviando…"
                        : "Reenviar anamnese"}
                    </Button>
                  )}
              </div>
              {resendAnamnesis.isSuccess && (
                <p className="mt-3 text-body-dense font-medium text-primary">
                  Link da anamnese enviado por WhatsApp.
                </p>
              )}
              {resendAnamnesis.isError && (
                <p className="mt-3 text-body-dense font-medium text-destructive">
                  {(resendAnamnesis.error as ApiError).message}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Trocar template */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar template da anamnese</DialogTitle>
          </DialogHeader>
          <p className="text-body-dense text-muted-foreground">
            Escolha outro template. As respostas atuais serão descartadas e a
            anamnese voltará a ficar pendente.
          </p>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  templates.isLoading ? "Carregando…" : "Selecione uma anamnese"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(templates.data?.items ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} · {ANAMNESIS_OBJECTIVE_LABELS[a.objective]} ·{" "}
                  {ANAMNESIS_MODALITY_LABELS[a.modality]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {replaceTemplate.isError && (
            <p className="text-body-dense font-medium text-destructive">
              {(replaceTemplate.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              onClick={() => replaceTemplate.mutate()}
              disabled={!templateId || replaceTemplate.isPending}
            >
              {replaceTemplate.isPending ? "Trocando…" : "Trocar template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
