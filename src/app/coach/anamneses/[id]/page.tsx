"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Pencil, Trash2, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
import { apiFetch } from "@/lib/api-client";
import {
  ANAMNESIS_MODALITY_LABELS,
  ANAMNESIS_OBJECTIVE_LABELS,
  ANAMNESIS_QUESTION_TYPE_LABELS,
  countQuestions,
  type AnamnesisDetailDto,
} from "@/lib/anamneses";
import type { StudentRosterDto } from "@/lib/students";

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export default function AnamnesisDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [studentId, setStudentId] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["anamnesis", id],
    queryFn: () => apiFetch<AnamnesisDetailDto>(`/api/anamneses/${id}`),
    retry: false,
  });

  // The roster, loaded only when the coach opens the picker. Archived alunos
  // are dropped — assigning an anamnese to someone who left is never intended.
  const students = useQuery({
    queryKey: ["students"],
    queryFn: () =>
      apiFetch<{ students: StudentRosterDto[] }>("/api/students").then((r) =>
        r.students.filter((s) => s.status !== "archived"),
      ),
    enabled: assignOpen,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/anamneses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anamneses"] });
      setDeleteOpen(false);
      router.push("/coach/anamneses");
      router.refresh();
    },
  });

  const copyMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ anamnesis: { id: string } }>(`/api/anamneses/${id}/copy`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["anamneses"] });
      router.push(`/coach/anamneses/${res.anamnesis.id}`);
    },
  });

  // "Usar com um aluno" — the action this page exists for. Reuses the same
  // assign endpoint the student profile drives, so a template reaches a person
  // from either direction.
  const assignMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/students/${studentId}/anamnesis/template`, {
        method: "PUT",
        body: JSON.stringify({ anamnesisId: id }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anamnesis", id] });
      queryClient.invalidateQueries({ queryKey: ["anamneses"] });
      queryClient.invalidateQueries({ queryKey: ["student-anamnesis", studentId] });
      setAssignOpen(false);
      router.push(`/coach/students/${studentId}`);
    },
  });

  const panel =
    "rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/coach/anamneses"
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-body text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
      >
        <ArrowLeft className="size-4" />
        Voltar às anamneses
      </Link>

      {isLoading ? (
        <div className={`mt-6 ${panel} p-10 text-center text-body text-muted-foreground`}>
          Carregando…
        </div>
      ) : isError ? (
        <div className={`mt-6 ${panel} p-10 text-center text-body text-destructive`}>
          {(error as Error).message}
        </div>
      ) : data ? (
        <>
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-headline font-bold text-foreground">
                {data.name}
              </h1>
              <Badge variant="neutral" className="font-medium">
                {ANAMNESIS_OBJECTIVE_LABELS[data.objective]}
              </Badge>
              <Badge variant="neutral" className="font-medium">
                {ANAMNESIS_MODALITY_LABELS[data.modality]}
              </Badge>
            </div>
            <p className="mt-1 text-body text-muted-foreground">
              {plural(data.sections.length, "seção", "seções")} ·{" "}
              {plural(countQuestions(data.sections), "pergunta", "perguntas")} ·{" "}
              {data.usageCount === 0
                ? "nenhum aluno usa esta anamnese"
                : `${plural(data.usageCount, "aluno", "alunos")} nesta anamnese`}
            </p>

            {/* One primary — the thing a template is for. Editar and Duplicar
                are the secondary pair; Excluir is set apart at the end so an
                irreversible action never sits in the same rhythm as the two
                safe ones. */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={() => setAssignOpen(true)}>
                <UserPlus className="size-4" />
                Usar com um aluno
              </Button>
              <Button asChild variant="outline">
                <Link href={`/coach/anamneses/${id}/edit`}>
                  <Pencil className="size-4" />
                  Editar
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => copyMutation.mutate()}
                disabled={copyMutation.isPending}
              >
                <Copy className="size-4" />
                {copyMutation.isPending ? "Duplicando…" : "Duplicar"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDeleteOpen(true)}
                className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
                Excluir
              </Button>
            </div>
          </div>

          {data.description && (
            <p className={`mt-4 rounded-xl border border-border bg-white p-4 text-body text-text-secondary shadow-[0_1px_8px_rgba(15,23,42,0.05)]`}>
              {data.description}
            </p>
          )}

          <div className="mt-4 space-y-4">
            {data.sections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center text-body text-muted-foreground">
                Esta anamnese ainda não tem seções. Use “Editar” para montá-la.
              </div>
            ) : (
              data.sections.map((section) => (
                <div key={section.key} className={panel}>
                  <h2 className="border-b border-border px-5 py-3 font-heading text-title font-semibold text-foreground">
                    {section.title}
                  </h2>
                  {section.questions.length === 0 ? (
                    <p className="px-5 py-4 text-body text-muted-foreground">
                      Sem perguntas nesta seção.
                    </p>
                  ) : (
                    <ol className="divide-y divide-border-light">
                      {section.questions.map((q, i) => (
                        <li
                          key={q.key}
                          className="flex items-start justify-between gap-3 px-5 py-3"
                        >
                          <span className="flex min-w-0 gap-2 text-body text-foreground">
                            <span className="shrink-0 text-meta">{i + 1}.</span>
                            <span className="min-w-0">{q.label}</span>
                          </span>
                          {/* Short text is the default and the overwhelming
                              majority, so it annotates rather than chips —
                              thirty identical pills down one edge is a drumbeat
                              that hides the handful of questions whose answer
                              shape actually differs. */}
                          {q.type === "short_text" ? (
                            <span className="shrink-0 text-label text-meta">
                              {ANAMNESIS_QUESTION_TYPE_LABELS[q.type]}
                            </span>
                          ) : (
                            <Badge variant="neutral" className="shrink-0 font-medium">
                              {ANAMNESIS_QUESTION_TYPE_LABELS[q.type]}
                            </Badge>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Usar com um aluno */}
          <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Usar com um aluno</DialogTitle>
                <DialogDescription>
                  “{data.name}” será copiada para o aluno escolhido e ficará
                  pendente até ser preenchida. Se ele já tiver uma anamnese, as
                  respostas atuais serão descartadas.
                </DialogDescription>
              </DialogHeader>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger aria-label="Aluno">
                  <SelectValue
                    placeholder={
                      students.isLoading ? "Carregando…" : "Selecione um aluno"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(students.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {students.data && students.data.length === 0 && (
                <p className="text-body-dense text-muted-foreground">
                  Nenhum aluno na sua clínica ainda.
                </p>
              )}
              {assignMutation.isError && (
                <p className="text-body-dense font-medium text-destructive">
                  {(assignMutation.error as Error).message}
                </p>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button
                  onClick={() => assignMutation.mutate()}
                  disabled={!studentId || assignMutation.isPending}
                >
                  {assignMutation.isPending ? "Atribuindo…" : "Atribuir ao aluno"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Excluir — the dialog states what actually happens. A student's
              anamnese is a frozen snapshot taken at assign time, so deleting a
              template never touches an answer. Saying so is the difference
              between a coach who decides and a coach who guesses. */}
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Excluir anamnese</DialogTitle>
                <DialogDescription>
                  {data.usageCount === 0
                    ? `“${data.name}” será excluída permanentemente. Nenhum aluno usa este template, então nada mais é afetado.`
                    : `“${data.name}” será excluída permanentemente e deixará de aparecer nesta lista. ${
                        data.usageCount === 1
                          ? "O aluno que já está nela"
                          : `Os ${data.usageCount} alunos que já estão nela`
                      } continua${data.usageCount === 1 ? "" : "m"} com a anamnese e as respostas — cada aluno guarda a sua própria cópia desde o momento em que a recebeu.`}
                </DialogDescription>
              </DialogHeader>
              {deleteMutation.isError && (
                <p className="text-body-dense font-medium text-destructive">
                  {(deleteMutation.error as Error).message}
                </p>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Excluindo…" : "Excluir"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
