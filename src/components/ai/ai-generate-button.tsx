"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";

import {
  AI_EQUIPMENT_LABELS,
  AI_EQUIPMENT_VALUES,
  AI_RESTRICTION_LABELS,
  AI_RESTRICTION_VALUES,
  formatAiUsage,
  type AiEquipment,
  type AiGenerateInput,
  type AiGenerateResultDto,
  type AiRestriction,
} from "@/lib/ai-programs";
import { apiFetch } from "@/lib/api-client";
import type { PlanUsageDto } from "@/lib/plans";
import type { StudentAnamnesisDto } from "@/lib/student-anamneses";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * "Gerar com IA" — the single entry point to the program generator, shared by
 * the student Treino and Dieta tabs.
 *
 * Two deliberate UX choices, both from `docs/ai-generator.md`:
 *
 * - **When it can't run, the button is disabled *with the reason*, never
 *   hidden.** A missing anamnese is the most common blocker and it is also the
 *   thing the coach can fix in one click — hiding the button would hide the
 *   fix. It also makes the AI feature the strongest reason a coach has ever had
 *   to actually send anamneses out.
 * - **Overwriting an existing draft asks first.** Silently destroying a coach's
 *   manual edits is the one unforgivable outcome; refusing outright would
 *   obstruct "regenerate, I didn't like it", which is the most likely second
 *   action.
 */

type Props = {
  studentId: string;
  kind: "workout" | "diet";
  /** Whether an unpublished draft would be overwritten. */
  hasDraft: boolean;
  /** Prefills the objective field — the aluno's recorded goal, when set. */
  defaultObjective?: string | null;
  /** Called after a successful generation so the page can refetch. */
  onGenerated: () => void;
};

const NOUN = { workout: "treino", diet: "dieta" } as const;

export function AiGenerateButton({
  studentId,
  kind,
  hasDraft,
  defaultObjective,
  onGenerated,
}: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [objective, setObjective] = useState(defaultObjective?.trim() ?? "");
  const [equipment, setEquipment] = useState<AiEquipment[]>([]);
  const [restrictions, setRestrictions] = useState<AiRestriction[]>([]);
  const [daysPerWeek, setDaysPerWeek] = useState(3);

  // Both reads are already cached by other panels on these pages, so opening
  // the dialog costs nothing in practice.
  const usage = useQuery({
    queryKey: ["plan-usage"],
    queryFn: () => apiFetch<PlanUsageDto>("/api/coach/plan-usage"),
  });
  const anamnesis = useQuery({
    queryKey: ["student-anamnesis", studentId],
    queryFn: () =>
      apiFetch<{ anamnesis: StudentAnamnesisDto | null }>(
        `/api/students/${studentId}/anamnesis`,
      ).then((r) => r.anamnesis),
  });

  const ready = anamnesis.data?.status === "completed";
  const used = usage.data?.ai.used ?? 0;
  const limit = usage.data?.ai.limit ?? null;
  const outOfCredits = limit !== null && used >= limit;

  const generate = useMutation({
    mutationFn: (input: AiGenerateInput) =>
      apiFetch<AiGenerateResultDto>(
        `/api/students/${studentId}/${kind}/generate`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan-usage"] });
      setOpen(false);
      setConfirmed(false);
      onGenerated();
    },
    onError: (e: Error) => setError(e.message),
  });

  // Disabled states, most actionable reason first.
  const blocked = !ready
    ? "Este aluno precisa de uma anamnese preenchida."
    : outOfCredits
      ? "Você já usou todas as gerações de IA deste mês."
      : null;

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const canSubmit =
    objective.trim().length >= 3 && equipment.length > 0 && !generate.isPending;

  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <Button
          variant="outline"
          disabled={blocked !== null || anamnesis.isLoading}
          onClick={() => {
            setError(null);
            setConfirmed(!hasDraft);
            setOpen(true);
          }}
        >
          <Sparkles className="size-4" />
          Gerar {NOUN[kind]} com IA
        </Button>
        {blocked !== null && (
          <p className="max-w-[22rem] text-center text-[12px] text-muted-foreground">
            {blocked}
          </p>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(false);
            setConfirmed(false);
            setError(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar {NOUN[kind]} com IA</DialogTitle>
          </DialogHeader>

          {!confirmed ? (
            // Overwrite gate. Named plainly, because the cost is a coach's own
            // edits and "are you sure?" alone doesn't say what is lost.
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                Já existe um rascunho de {NOUN[kind]} não publicado para este aluno.
                Gerar de novo <strong>substitui o rascunho atual</strong>, incluindo
                as edições que você fez à mão.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => setConfirmed(true)}>
                  Substituir rascunho
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="ai-objective">
                  Objetivo
                </label>
                <Input
                  id="ai-objective"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="Ex. hipertrofia com foco em membros inferiores"
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Equipamentos disponíveis
                </legend>
                <div className="flex flex-wrap gap-2">
                  {AI_EQUIPMENT_VALUES.map((value) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[13px] has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <input
                        type="checkbox"
                        className="size-3.5"
                        checked={equipment.includes(value)}
                        onChange={() => setEquipment((l) => toggle(l, value))}
                      />
                      {AI_EQUIPMENT_LABELS[value]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Restrições alimentares
                </legend>
                <div className="flex flex-wrap gap-2">
                  {AI_RESTRICTION_VALUES.map((value) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[13px] has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <input
                        type="checkbox"
                        className="size-3.5"
                        checked={restrictions.includes(value)}
                        onChange={() => setRestrictions((l) => toggle(l, value))}
                      />
                      {AI_RESTRICTION_LABELS[value]}
                    </label>
                  ))}
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Deixe em branco se não houver restrições.
                </p>
              </fieldset>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="ai-days">
                  Dias por semana
                </label>
                <Input
                  id="ai-days"
                  type="number"
                  min={1}
                  max={7}
                  value={daysPerWeek}
                  onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                  className="w-24"
                />
              </div>

              <p className="text-[12px] text-muted-foreground">
                {formatAiUsage(used, limit)}. Cada geração consome uma. O resultado
                fica como rascunho — o aluno só vê depois que você publicar.
              </p>

              {error !== null && (
                <p className="text-[13px] text-destructive">{error}</p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={!canSubmit}
                  onClick={() => {
                    setError(null);
                    generate.mutate({
                      objective: objective.trim(),
                      equipment,
                      restrictions,
                      daysPerWeek,
                    });
                  }}
                >
                  {generate.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Gerando…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      Gerar
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
