"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileDown } from "lucide-react";

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
import { apiFetch } from "@/lib/api-client";
import type { OpenGymExportResponse, OpenGymExportSummary } from "@/lib/opengym-plan";

export function OpenGymExportButton({
  url,
  size = "sm",
}: {
  url: string;
  size?: "sm" | "default";
}) {
  const [summary, setSummary] = useState<OpenGymExportSummary | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const exportMutation = useMutation({
    mutationFn: () => apiFetch<OpenGymExportResponse>(url),
    onSuccess: (res) => {
      const blob = new Blob([JSON.stringify(res.plan, null, 2)], {
        type: "application/json",
      });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = res.fileName;
      link.click();
      URL.revokeObjectURL(href);
      setSummary(res.summary);
    },
    onError: (error) => setFailure(error.message),
  });

  const exact =
    summary !== null &&
    summary.workout.length === 0 &&
    summary.exercises.length === 0 &&
    summary.customExercises.length === 0;

  return (
    <>
      <Button
        variant="outline"
        size={size}
        onClick={() => exportMutation.mutate()}
        disabled={exportMutation.isPending}
      >
        <FileDown className="size-4" />
        {exportMutation.isPending ? "Exportando…" : "Exportar para openGym"}
      </Button>

      <Dialog
        open={summary !== null || failure !== null}
        onOpenChange={(open) => {
          if (open) return;
          setSummary(null);
          setFailure(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {failure ? "Não foi possível exportar" : "Treino exportado para openGym"}
            </DialogTitle>
            <DialogDescription>
              {failure ?? "O arquivo foi baixado. No openGym, abra-o pela importação de plano."}
            </DialogDescription>
          </DialogHeader>
          {summary &&
            (exact ? (
              <p className="text-sm text-muted-foreground">
                Tudo foi exportado exatamente como está no treino.
              </p>
            ) : (
              <div className="space-y-4 text-sm">
                {summary.customExercises.length > 0 && (
                  <section>
                    <h3 className="font-semibold text-foreground">
                      Exportados como exercícios personalizados do openGym
                    </h3>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                      {summary.customExercises.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {summary.workout.length > 0 && (
                  <section>
                    <h3 className="font-semibold text-foreground">Treino</h3>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                      {summary.workout.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {summary.exercises.length > 0 && (
                  <section>
                    <h3 className="font-semibold text-foreground">Aproximações</h3>
                    <ul className="mt-1 space-y-2">
                      {summary.exercises.map((entry, i) => (
                        <li key={i}>
                          <p className="font-medium text-foreground">
                            {entry.exercise}
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · {entry.session}
                            </span>
                          </p>
                          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                            {entry.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            ))}
          <DialogFooter>
            <DialogClose asChild>
              <Button>Fechar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
