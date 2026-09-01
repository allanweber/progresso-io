"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

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
  const formRef = useRef<HTMLFormElement>(null);

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
        <p className="text-body text-muted-foreground">Carregando anamnese…</p>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-2xl">
        <Link
          href={`/coach/students/${id}`}
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-body text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
        >
          <ArrowLeft className="size-4" />
          Voltar ao aluno
        </Link>
        {isError ? (
          <p className="mt-4 text-body text-destructive">
            {(error as Error).message}
          </p>
        ) : (
          <div className="mt-4 rounded-2xl bg-white p-8 text-center shadow-rest">
            <p className="text-body text-muted-foreground">
              Este aluno ainda não tem uma anamnese. Atribua um dos templates da
              sua clínica no perfil dele para começar.
            </p>
            <Button asChild className="mt-4">
              <Link href={`/coach/students/${id}`}>Ir para o perfil do aluno</Link>
            </Button>
          </div>
        )}
      </div>
    );
  }

  const banner = save.error instanceof ApiError ? save.error.message : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/coach/students/${id}`}
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-body text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
      >
        <ArrowLeft className="size-4" />
        Voltar ao aluno
      </Link>
      <h1 className="mt-3 font-heading text-headline font-bold text-foreground">
        {data.name}
      </h1>
      <p className="mt-1 text-body text-muted-foreground">
        Preencha ou ajuste as respostas da anamnese do aluno.
      </p>

      {banner && (
        <div className="mt-4 rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
          {banner}
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const errs = validateAnswers(data.sections, answers);
          setClientErrors(errs);
          if (Object.keys(errs).length === 0) {
            save.mutate();
            return;
          }
          // Same reason as the aluno's form: the offending field can be far
          // above the button that was just pressed.
          const first = Object.keys(errs)[0];
          const el = formRef.current?.querySelector<HTMLElement>(
            `#q-${CSS.escape(first)}`,
          );
          if (el) {
            el.scrollIntoView({ block: "center" });
            el.focus({ preventScroll: true });
          }
        }}
        className="mt-6 space-y-6 rounded-2xl bg-white p-6 shadow-rest"
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
