"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AnamnesisFillForm } from "@/components/anamneses/anamnesis-fill-form";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api-client";
import { validateAnswers } from "@/lib/anamneses";
import type {
  AnamnesisAnswers,
  AnamnesisAnswerValue,
  StudentAnamnesisDto,
} from "@/lib/student-anamneses";

/**
 * The coach fills / edits a student's anamnese here. Offline students land here
 * right after "Registrar aluno"; the profile's "Preencher" / "Editar" links also
 * point here. Saves the whole answers map via the student-anamnesis API.
 */
export default function CoachFillAnamnesisPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  // Local edits override the loaded snapshot; null means "not edited yet", so we
  // render the fetched answers until the coach touches a field (no effect needed).
  const [edited, setEdited] = useState<AnamnesisAnswers | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["student-anamnesis", id],
    queryFn: () =>
      apiFetch<{ anamnesis: StudentAnamnesisDto | null }>(
        `/api/students/${id}/anamnesis`,
      ).then((r) => r.anamnesis),
  });

  const answers: AnamnesisAnswers = edited ?? data?.answers ?? {};

  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ anamnesis: StudentAnamnesisDto }>(
        `/api/students/${id}/anamnesis`,
        { method: "PUT", body: JSON.stringify({ answers }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-anamnesis", id] });
      queryClient.invalidateQueries({ queryKey: ["student", id] });
      router.push(`/coach/students/${id}`);
      router.refresh();
    },
  });

  function onAnswer(key: string, value: AnamnesisAnswerValue) {
    setEdited((prev) => ({ ...(prev ?? data?.answers ?? {}), [key]: value }));
    setClientErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-muted-foreground">Carregando anamnese…</p>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-2xl">
        <Link
          href={`/coach/students/${id}`}
          className="text-[13px] text-[#94A3B8] transition-colors hover:text-primary"
        >
          ← Voltar ao aluno
        </Link>
        <p className="mt-4 text-sm text-destructive">
          {isError
            ? (error as Error).message
            : "Este aluno ainda não tem uma anamnese."}
        </p>
      </div>
    );
  }

  const banner = save.error instanceof ApiError ? save.error.message : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/coach/students/${id}`}
        className="text-[13px] text-[#94A3B8] transition-colors hover:text-primary"
      >
        ← Voltar ao aluno
      </Link>
      <h1 className="mt-3 font-heading text-2xl font-bold text-foreground">
        {data.name}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Preencha ou ajuste as respostas da anamnese do aluno.
      </p>

      {banner && (
        <div className="mt-4 rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
          {banner}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const errs = validateAnswers(data.sections, answers);
          setClientErrors(errs);
          if (Object.keys(errs).length === 0) save.mutate();
        }}
        className="mt-6 space-y-6 rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
      >
        <AnamnesisFillForm
          sections={data.sections}
          answers={answers}
          onAnswer={onAnswer}
          disabled={save.isPending}
          errors={{
            ...(save.error instanceof ApiError ? (save.error.fieldErrors ?? {}) : {}),
            ...clientErrors,
          }}
        />
        <div className="flex items-center gap-3 border-t border-border pt-5">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar anamnese"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/coach/students/${id}`)}
            disabled={save.isPending}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
