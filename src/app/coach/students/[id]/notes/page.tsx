"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Pencil, Sparkles, Trash2 } from "lucide-react";

import { StudentTabs } from "@/components/students/student-tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  bodyFatSourceLabel,
  EVALUATION_VERDICT_LABELS,
} from "@/lib/ai-evaluation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatCheckinDate, formatCheckinWeight } from "@/lib/student-checkins";
import { NOTE_SOURCE_LABELS, type StudentNoteDto } from "@/lib/student-notes";
import type { StudentRosterDto } from "@/lib/students";

/**
 * Notas do aluno — the coach's own record: what they noticed, what they decided,
 * and every AI evaluation they accepted.
 *
 * **Coach-only, and the page says so.** Nothing under `/api/student/*` reads the
 * notes table, so the guarantee is structural — but a coach has to believe it
 * before they will write anything candid here, which is what the lock line at
 * the top is for.
 *
 * An AI note renders its stored payload as a card above the coach's words; a
 * manual note is the same row with no payload. One timeline, one shape.
 */
export default function StudentNotesPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const student = useQuery({
    queryKey: ["student", id],
    queryFn: () =>
      apiFetch<{ student: StudentRosterDto }>(`/api/students/${id}`).then(
        (r) => r.student,
      ),
  });

  const notes = useQuery({
    queryKey: ["student-notes", id],
    queryFn: () =>
      apiFetch<{ notes: StudentNoteDto[] }>(`/api/students/${id}/notes`).then(
        (r) => r.notes,
      ),
  });

  const create = useMutation({
    mutationFn: (body: string) =>
      apiFetch<{ note: StudentNoteDto }>(`/api/students/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({ body, checkinId: null }),
      }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["student-notes", id] });
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : "Não foi possível salvar."),
  });

  const name = student.data
    ? `${student.data.firstName} ${student.data.lastName}`
    : "Aluno";
  const list = notes.data ?? [];

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

      <p className="mt-4 flex items-center gap-1.5 text-body-dense text-muted-foreground">
        <Lock className="size-3.5" />
        Só a equipe da clínica vê estas notas. O aluno nunca tem acesso.
      </p>

      <form
        className="mt-4 rounded-xl border border-border p-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (draft.trim() !== "") create.mutate(draft);
        }}
      >
        <Label htmlFor="note-body" className="text-caption font-medium text-muted-foreground">
          Nova nota
        </Label>
        <Textarea
          id="note-body"
          rows={3}
          className="mt-1"
          placeholder="Relatou dormir mal na semana; ajustar volume se repetir."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {error && (
          <p className="mt-2 text-body-dense text-destructive">{error}</p>
        )}
        <div className="mt-2 flex justify-end">
          <Button type="submit" size="sm" disabled={create.isPending || draft.trim() === ""}>
            {create.isPending ? "Salvando…" : "Salvar nota"}
          </Button>
        </div>
      </form>

      <div className="mt-5 flex flex-col gap-3">
        {notes.isPending ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : notes.isError ? (
          <p className="text-sm text-destructive">
            Não foi possível carregar as notas.
          </p>
        ) : list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-body-dense text-muted-foreground">
            Nenhuma nota ainda. Escreva a primeira acima, ou aceite uma avaliação
            com IA na aba Feedback.
          </p>
        ) : (
          list.map((note) => (
            <NoteCard key={note.id} studentId={id} note={note} />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * One note. Editing rewrites only the body — an AI note's `payload` is the
 * record of what the model actually said, and it stays put underneath whatever
 * the coach writes over it.
 */
function NoteCard({
  studentId,
  note,
}: {
  studentId: string;
  note: StudentNoteDto;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["student-notes", studentId] });

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/students/${studentId}/notes/${note.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setEditing(false);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      apiFetch(`/api/students/${studentId}/notes/${note.id}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });

  const ai = note.source === "ai_evaluation" ? note.payload : null;

  return (
    <article className="rounded-xl border border-border p-3.5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {ai && <Sparkles className="size-3.5 text-primary" />}
          <span className="text-caption font-semibold text-foreground">
            {NOTE_SOURCE_LABELS[note.source]}
          </span>
          <span className="text-caption text-muted-foreground">
            · {formatCheckinDate(note.createdAt.slice(0, 10))}
            {note.checkinDate
              ? ` · check-in de ${formatCheckinDate(note.checkinDate)}`
              : ""}
            {note.authorName ? ` · ${note.authorName}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Editar nota"
            onClick={() => {
              setBody(note.body);
              setEditing((v) => !v);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          {confirmDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <span className="text-destructive">Confirmar</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Excluir nota"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </header>

      {ai && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-body-dense">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary">
            {EVALUATION_VERDICT_LABELS[ai.verdict]}
          </span>
          {note.bodyFatPct !== null ? (
            <>
              <span className="text-foreground">
                {formatCheckinWeight(note.bodyFatPct)}% de gordura
              </span>
              {note.leanMassPct !== null && (
                <span className="text-muted-foreground">
                  massa magra {formatCheckinWeight(note.leanMassPct)}%
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">sem % de gordura</span>
          )}
          {/* The origin travels with the number wherever it is shown — a
              caliper reading and a photo estimate must never look alike. */}
          {note.payload && note.bodyFatPct !== null && (
            <span className="text-caption text-muted-foreground">
              {bodyFatSourceLabel(
                note.payload.bodyFatPct === null ? "skinfolds" : "estimate",
                note.payload.confidence,
              )}
            </span>
          )}
          {note.acceptance === "accepted_edited" && (
            <span className="text-caption text-muted-foreground">
              editada pelo coach
            </span>
          )}
        </div>
      )}

      {editing ? (
        <div className="mt-2.5">
          <Textarea
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={save.isPending || body.trim() === ""}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2.5 whitespace-pre-wrap text-body-dense text-foreground">
          {note.body}
        </p>
      )}
    </article>
  );
}
