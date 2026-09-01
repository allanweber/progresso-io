"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, FilePlus2 } from "lucide-react";

import { AnamnesisBuilder } from "@/components/anamneses/anamnesis-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import {
  ANAMNESIS_MODALITY_LABELS,
  ANAMNESIS_OBJECTIVE_LABELS,
  type AnamnesisListResponse,
} from "@/lib/anamneses";

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * "Nova anamnese". Every clinic is seeded with a curated starter set
 * (`seedClinicAnamneses`), so a blank canvas is almost never the right first
 * screen: copying a 30-question template and trimming it is minutes of work
 * where authoring one from nothing is an evening. The chooser leads, and the
 * blank builder stays one click away. A clinic that really has no templates
 * skips straight to the builder.
 */
export default function NewAnamnesisPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [fromScratch, setFromScratch] = useState(false);

  const templates = useQuery({
    queryKey: ["anamneses", "starters"],
    queryFn: () =>
      apiFetch<AnamnesisListResponse>("/api/anamneses?pageSize=100"),
  });

  const copyMutation = useMutation({
    mutationFn: (sourceId: string) =>
      apiFetch<{ anamnesis: { id: string } }>(
        `/api/anamneses/${sourceId}/copy`,
        { method: "POST" },
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["anamneses"] });
      router.push(`/coach/anamneses/${res.anamnesis.id}/edit`);
    },
  });

  const items = templates.data?.items ?? [];
  const showBuilder = fromScratch || (templates.isSuccess && items.length === 0);

  if (showBuilder) {
    return (
      <div>
        <h1 className="mx-auto mb-4 max-w-3xl font-heading text-headline font-bold text-foreground">
          Nova anamnese
        </h1>
        <AnamnesisBuilder mode="create" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/coach/anamneses"
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-body text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
      >
        <ArrowLeft className="size-4" />
        Voltar às anamneses
      </Link>

      <h1 className="mt-3 font-heading text-headline font-bold text-foreground">
        Nova anamnese
      </h1>
      <p className="mt-1 text-body text-muted-foreground">
        Copie uma das anamneses da sua clínica e ajuste o que precisar, ou monte
        uma do zero.
      </p>

      {templates.isLoading ? (
        <div className="mt-5 rounded-2xl bg-white p-10 text-center text-body text-muted-foreground shadow-rest">
          Carregando modelos…
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-rest sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">
                  {a.name}
                </span>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="neutral" className="font-medium">
                    {ANAMNESIS_OBJECTIVE_LABELS[a.objective]}
                  </Badge>
                  <span className="text-label text-muted-foreground">
                    {ANAMNESIS_MODALITY_LABELS[a.modality]} ·{" "}
                    {plural(a.questionCount, "pergunta", "perguntas")} em{" "}
                    {plural(a.sectionCount, "seção", "seções")}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => copyMutation.mutate(a.id)}
                disabled={copyMutation.isPending}
                className="h-11 w-full shrink-0 sm:h-10 sm:w-auto"
              >
                <Copy className="size-4" />
                {copyMutation.isPending && copyMutation.variables === a.id
                  ? "Copiando…"
                  : "Copiar e editar"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {copyMutation.isError && (
        <p className="mt-3 text-body-dense font-medium text-destructive">
          {(copyMutation.error as Error).message}
        </p>
      )}

      <button
        type="button"
        onClick={() => setFromScratch(true)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-border bg-white py-4 text-body font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <FilePlus2 className="size-4" />
        Montar uma anamnese do zero
      </button>
    </div>
  );
}
