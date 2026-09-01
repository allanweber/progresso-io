"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";

import {
  AI_DEFAULT_DAYS_PER_WEEK,
  numOrNull,
  AI_EQUIPMENT_LABELS,
  AI_EQUIPMENT_VALUES,
  AI_MACRO_PROFILE_LABELS,
  AI_MACRO_PROFILE_VALUES,
  AI_RESTRICTION_LABELS,
  AI_RESTRICTION_VALUES,
  formatAiUsage,
  macroProfileConflict,
  type AiEquipment,
  type AiGenerateInput,
  type AiGenerateResultDto,
  type AiMacroProfile,
  type AiRestriction,
} from "@/lib/ai-programs";
import {
  readAiDietMemory,
  readAiWorkoutMemory,
  writeAiMemory,
} from "@/lib/ai-generate-memory";
import {
  DEFAULT_AI_MEALS,
  MEAL_SLOT_LABELS,
  MEAL_SLOT_VALUES,
  type MealSlot,
} from "@/lib/meals";
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
 *
 * The two kinds share the button, the gates and the overwrite flow, but **not
 * the questions**: a treino asks what the aluno can train with and how often, a
 * dieta what they can't eat and how the day is split. Asking both sets on both
 * screens is what previously made a diet impossible to generate without ticking
 * gym equipment. They remain two separate generations, one credit each.
 *
 * **The answers are remembered per aluno** (`@/lib/ai-generate-memory`, in
 * `localStorage`). Opening the dialog restores what was asked for last time so
 * the coach adjusts rather than retypes, and every edit is written back as it
 * is made — *not* only on submit, because the coach who fills the form and then
 * gets interrupted is precisely the one who should not have to type it twice.
 * `fromScratch` is the one field that never carries over — see that module.
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


/**
 * **Objetivo** is the one question both kinds ask, which is exactly why its
 * example cannot be shared: a single hard-coded "hipertrofia com foco em
 * membros inferiores" greeted a coach filling in a *dieta* with a training
 * split. The placeholder is the only instruction this field carries — nothing
 * else on the screen says what a good objective looks like — so an example from
 * the wrong domain is worse than no example, and it reaches the model verbatim.
 */
const OBJECTIVE_PLACEHOLDER = {
  workout: "Ex. hipertrofia com foco em membros inferiores",
  diet: "Ex. emagrecimento preservando massa magra, sem lactose",
} as const;

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
  // Only the fields this kind asks for are ever read; the others stay at their
  // initial value and never reach the payload.
  const [equipment, setEquipment] = useState<AiEquipment[]>([]);
  const [daysPerWeek, setDaysPerWeek] = useState(AI_DEFAULT_DAYS_PER_WEEK);
  const [restrictions, setRestrictions] = useState<AiRestriction[]>([]);
  const [meals, setMeals] = useState<MealSlot[]>(DEFAULT_AI_MEALS);
  // The day's total, as a string so an emptied box is "" (→ null) rather than
  // a 0 nobody typed. Blank is the normal case: the ticked slots already say
  // how many there are.
  const [mealsPerDayRaw, setMealsPerDayRaw] = useState("");
  const [macroProfiles, setMacroProfiles] = useState<AiMacroProfile[]>([]);
  const [preferences, setPreferences] = useState("");
  const [avoid, setAvoid] = useState("");
  const [fromScratch, setFromScratch] = useState(false);
  // Empty string, not 0 — "" renders an empty box and reaches the schema as
  // null, whereas 0 would show a zero the coach never typed and read as a
  // target of zero calories.
  const [targetKcal, setTargetKcal] = useState("");
  const [targetProteinG, setTargetProteinG] = useState("");
  const [targetCarbsG, setTargetCarbsG] = useState("");
  const [targetFatG, setTargetFatG] = useState("");

  // Both reads share the cache with the panels already on these pages: the
  // usage entry is keyed exactly as the shell's, which the coach layout seeds
  // server-side, so opening the dialog costs no round-trip. Keep this key in
  // step with the other "coach-plan-usage" consumers — a private key here is
  // what made the credit count go stale after a generation.
  const usage = useQuery({
    queryKey: ["coach-plan-usage"],
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
        {
          method: "POST",
          body: JSON.stringify(input),
          // `apiFetch`'s 15s default is sized for ordinary CRUD and is far too
          // short here: a program draft is one long completion, and the server
          // gives the provider 90s. Without this the browser aborts first and
          // the coach reads "o servidor demorou a responder" while the
          // generation is still running — and finishes, spending the credit.
          // Comfortably past the server's own ceiling, so whatever the coach
          // sees is the real outcome.
          signal: AbortSignal.timeout(120_000),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-plan-usage"] });
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

  /**
   * Brings back what this aluno's last generation asked for.
   *
   * Run when the dialog **opens**, not on mount: the coach may have generated
   * from the other tab, or in another browser tab entirely, and the answers on
   * screen should be the newest ones rather than whichever set existed when this
   * page loaded.
   *
   * `fromScratch` is reset here unconditionally — it is a one-time instruction
   * to discard the aluno's current dieta, and it must be re-ticked deliberately
   * every single time, whether or not anything was remembered.
   */
  function restoreAnswers() {
    setFromScratch(false);
    if (kind === "workout") {
      const saved = readAiWorkoutMemory(studentId);
      if (!saved) return;
      // A remembered blank objective still yields to the aluno's recorded goal:
      // the prefill is the better answer, and an empty required field is not
      // worth "restoring".
      setObjective(saved.objective || defaultObjective?.trim() || "");
      setEquipment(saved.equipment);
      setDaysPerWeek(saved.daysPerWeek);
      return;
    }
    const saved = readAiDietMemory(studentId);
    if (!saved) return;
    setObjective(saved.objective || defaultObjective?.trim() || "");
    setRestrictions(saved.restrictions);
    setMeals(saved.meals);
    setMealsPerDayRaw(saved.mealsPerDayRaw);
    setMacroProfiles(saved.macroProfiles);
    setPreferences(saved.preferences);
    setAvoid(saved.avoid);
    setTargetKcal(saved.targetKcal);
    setTargetProteinG(saved.targetProteinG);
    setTargetCarbsG(saved.targetCarbsG);
    setTargetFatG(saved.targetFatG);
  }

  /**
   * Writes the answers back as they are edited, for as long as the dialog is
   * open.
   *
   * **Not on submit.** Persisting only what was generated loses the more common
   * interruption by far: the coach who ticks six restrictions, gets a call, and
   * closes the dialog. Nothing was generated, so nothing would have been saved,
   * and the next open is the blank form all over again.
   *
   * Gated on `open` so the initial mount never runs it — otherwise the defaults
   * this component starts with would be written over a real saved record before
   * anyone had opened anything. By the time it does run, `restoreAnswers` has
   * already put the saved values into state, so the first write is the record
   * restoring itself.
   */
  useEffect(() => {
    if (!open) return;
    if (kind === "workout") {
      writeAiMemory("workout", studentId, {
        objective: objective.trim(),
        equipment,
        daysPerWeek,
      });
      return;
    }
    writeAiMemory("diet", studentId, {
      objective: objective.trim(),
      restrictions,
      meals,
      // The raw box, as typed — remembering "" is what keeps an empty total
      // empty instead of pinning it to a number the coach never chose.
      mealsPerDayRaw,
      macroProfiles,
      preferences: preferences.trim(),
      avoid: avoid.trim(),
      targetKcal,
      targetProteinG,
      targetCarbsG,
      targetFatG,
    });
  }, [
    open,
    kind,
    studentId,
    objective,
    equipment,
    daysPerWeek,
    restrictions,
    meals,
    mealsPerDayRaw,
    macroProfiles,
    preferences,
    avoid,
    targetKcal,
    targetProteinG,
    targetCarbsG,
    targetFatG,
  ]);

  /**
   * The dieta's meal answer, in any of its three shapes: ticked slots, a bare
   * total, or slots inside a larger total. The failure worth catching here is
   * the last one — a total below the slots already ticked describes a day that
   * cannot be built, and the coach should see why before spending a credit.
   */
  const mealsPerDay = numOrNull(mealsPerDayRaw);
  const mealsProblem =
    meals.length === 0 && mealsPerDay === null
      ? "Escolha as refeições ou informe quantas por dia."
      : mealsPerDay !== null && (mealsPerDay < 2 || mealsPerDay > MEAL_SLOT_VALUES.length)
        ? `O total deve ficar entre 2 e ${MEAL_SLOT_VALUES.length}.`
        : mealsPerDay !== null && mealsPerDay < meals.length
          ? "O total não pode ser menor que as refeições escolhidas."
          : null;

  // Equipment is the treino's only extra required answer; the dieta's
  // restrictions are legitimately answerable as "none", so it needs no gate
  // beyond the objective.
  // Alto + baixo carbo contradict each other, and low-carb + low-fat leaves
  // protein carrying the calories. Caught here so the coach sees which pair is
  // the problem, rather than a 400 after a credit was claimed.
  const profileProblem = macroProfileConflict(macroProfiles);

  const canSubmit =
    objective.trim().length >= 3 &&
    (kind === "diet"
      ? mealsProblem === null && profileProblem === null
      : equipment.length > 0) &&
    !generate.isPending;

  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <Button
          variant="outline"
          disabled={blocked !== null || anamnesis.isLoading}
          onClick={() => {
            setError(null);
            restoreAnswers();
            setConfirmed(!hasDraft);
            setOpen(true);
          }}
        >
          <Sparkles className="size-4" />
          Gerar {NOUN[kind]} com IA
        </Button>
        {blocked !== null && (
          <p className="max-w-[22rem] text-center text-label text-muted-foreground">
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
                  placeholder={OBJECTIVE_PLACEHOLDER[kind]}
                />
              </div>

              {kind === "workout" ? (
                <>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">
                      Equipamentos disponíveis
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {AI_EQUIPMENT_VALUES.map((value) => (
                        <label
                          key={value}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-body-dense has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                        >
                          <input
                            type="checkbox"
                            className="size-3.5"
                            checked={equipment.includes(value)}
                            onChange={() =>
                              setEquipment((l) => toggle(l, value))
                            }
                          />
                          {AI_EQUIPMENT_LABELS[value]}
                        </label>
                      ))}
                    </div>
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
                </>
              ) : (
                <>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">
                      Restrições alimentares
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {AI_RESTRICTION_VALUES.map((value) => (
                        <label
                          key={value}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-body-dense has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                        >
                          <input
                            type="checkbox"
                            className="size-3.5"
                            checked={restrictions.includes(value)}
                            onChange={() =>
                              setRestrictions((l) => toggle(l, value))
                            }
                          />
                          {AI_RESTRICTION_LABELS[value]}
                        </label>
                      ))}
                    </div>
                    <p className="text-label text-muted-foreground">
                      Deixe em branco se não houver restrições.
                    </p>
                  </fieldset>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">
                      Refeições do dia
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {MEAL_SLOT_VALUES.map((value) => (
                        <label
                          key={value}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-body-dense has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                        >
                          <input
                            type="checkbox"
                            className="size-3.5"
                            checked={meals.includes(value)}
                            onChange={() => setMeals((l) => toggle(l, value))}
                          />
                          {MEAL_SLOT_LABELS[value]}
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        className="text-body-dense text-muted-foreground"
                        htmlFor="ai-meals-per-day"
                      >
                        Total de refeições no dia{" "}
                        <span className="text-muted-foreground">(opcional)</span>
                      </label>
                      <Input
                        id="ai-meals-per-day"
                        type="number"
                        min={2}
                        max={MEAL_SLOT_VALUES.length}
                        inputMode="numeric"
                        className="w-20"
                        value={mealsPerDayRaw}
                        onChange={(e) => setMealsPerDayRaw(e.target.value)}
                        placeholder={String(meals.length || "")}
                      />
                    </div>
                    {/* The three modes, said plainly — a coach should not have
                        to discover that ticking two and typing six means "these
                        two plus four you choose". */}
                    <p className="text-label text-muted-foreground">
                      Escolher as refeições (e não só quantas) é o que faz a IA
                      montar café da manhã como café da manhã. Só o total: a IA
                      escolhe quais. Os dois: as marcadas são obrigatórias e a IA
                      completa o resto até o total.
                    </p>
                    {mealsProblem !== null && (
                      <p className="text-label text-destructive">{mealsProblem}</p>
                    )}
                  </fieldset>

                  <div className="space-y-1.5">
                    <label
                      className="text-sm font-medium"
                      htmlFor="ai-preferences"
                    >
                      Preferências <span className="font-normal text-muted-foreground">(opcional)</span>
                    </label>
                    <Input
                      id="ai-preferences"
                      value={preferences}
                      onChange={(e) => setPreferences(e.target.value)}
                      placeholder="Ex. gosta de ovo, banana, frango, tapioca"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ai-avoid">
                      Evitar <span className="font-normal text-muted-foreground">(opcional)</span>
                    </label>
                    <Input
                      id="ai-avoid"
                      value={avoid}
                      onChange={(e) => setAvoid(e.target.value)}
                      placeholder="Ex. não come peixe, odeia jiló"
                    />
                    <p className="text-label text-muted-foreground">
                      Aversões específicas, além das restrições acima.
                    </p>
                  </div>

                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">
                      Perfil de macros{" "}
                      <span className="font-normal text-muted-foreground">
                        (opcional)
                      </span>
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {AI_MACRO_PROFILE_VALUES.map((value) => (
                        <label
                          key={value}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-body-dense has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                        >
                          <input
                            type="checkbox"
                            className="size-3.5"
                            checked={macroProfiles.includes(value)}
                            onChange={() =>
                              setMacroProfiles((l) => toggle(l, value))
                            }
                          />
                          {AI_MACRO_PROFILE_LABELS[value]}
                        </label>
                      ))}
                    </div>
                    {/* The answer most coaches actually have: they rarely carry
                        "180 g de proteína" per aluno, but they do know they want
                        this one alta proteína e baixo carbo. */}
                    <p className="text-label text-muted-foreground">
                      A forma do plano, sem precisar calcular gramas. Combine à
                      vontade — ex. alta proteína com baixo carboidrato.
                    </p>
                    {profileProblem !== null && (
                      <p className="text-label text-destructive">
                        {profileProblem}
                      </p>
                    )}
                  </fieldset>

                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">
                      Metas{" "}
                      <span className="font-normal text-muted-foreground">
                        (opcional)
                      </span>
                    </legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        [
                          ["ai-kcal", "kcal", targetKcal, setTargetKcal],
                          ["ai-prot", "Proteína (g)", targetProteinG, setTargetProteinG],
                          ["ai-carb", "Carbo (g)", targetCarbsG, setTargetCarbsG],
                          ["ai-fat", "Gordura (g)", targetFatG, setTargetFatG],
                        ] as const
                      ).map(([id, label, value, set]) => (
                        <div key={id} className="space-y-1">
                          <label className="text-label text-muted-foreground" htmlFor={id}>
                            {label}
                          </label>
                          <Input
                            id={id}
                            type="number"
                            min={1}
                            inputMode="numeric"
                            value={value}
                            onChange={(e) => set(e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-label text-muted-foreground">
                      Em branco, a IA calcula a partir da anamnese. Preenchido,
                      vira alvo — não sugestão, e manda sobre o perfil acima.
                    </p>
                  </fieldset>

                  {/* Continuity is the default; the reset is the exception, and
                      it says what it costs before it is ticked. */}
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 has-[:checked]:border-amber-300 has-[:checked]:bg-warn-bg">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-3.5"
                        checked={fromScratch}
                        onChange={(e) => setFromScratch(e.target.checked)}
                      />
                      <span className="text-body-dense">
                        <strong>Recomeçar do zero</strong>
                        <span className="block text-muted-foreground">
                          Por padrão, havendo dieta atual, a IA parte dela e só
                          ajusta — o aluno continua com a rotina que já segue.
                          Marque para ignorá-la e montar outra do zero.
                        </span>
                      </span>
                    </label>
                </>
              )}

              <p className="text-label text-muted-foreground">
                {formatAiUsage(used, limit)}. Treino e dieta são gerações
                separadas — cada uma consome uma. O resultado fica como rascunho
                — o aluno só vê depois que você publicar.
              </p>

              {error !== null && (
                <p className="text-body-dense text-destructive">{error}</p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={!canSubmit}
                  onClick={() => {
                    setError(null);
                    // The answers are already on disk — the effect above wrote
                    // them as they were typed. This only has to send them.
                    generate.mutate(
                      kind === "workout"
                        ? {
                            objective: objective.trim(),
                            equipment,
                            daysPerWeek,
                          }
                        : {
                            objective: objective.trim(),
                            restrictions,
                            meals,
                            mealsPerDay,
                            macroProfiles,
                            // Never remembered — see `restoreAnswers`.
                            fromScratch,
                            targetKcal: numOrNull(targetKcal),
                            targetProteinG: numOrNull(targetProteinG),
                            targetCarbsG: numOrNull(targetCarbsG),
                            targetFatG: numOrNull(targetFatG),
                            // Blank is normalised to null by the schema so the
                            // prompt skips the line rather than sending an empty
                            // label.
                            preferences: preferences.trim() || null,
                            avoid: avoid.trim() || null,
                          },
                    );
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
