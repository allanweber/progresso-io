import type { AnamnesisSection } from "@/lib/anamneses";
import type { AnamnesisAnswers } from "@/lib/student-anamneses";
import {
  AI_EQUIPMENT_LABELS,
  AI_MEAL_SLOT_LABELS,
  AI_MEAL_SLOT_TIMES,
  AI_RESTRICTION_LABELS,
  type AiDietGenerateInput,
  type AiWorkoutGenerateInput,
} from "@/lib/ai-programs";
import type { CatalogBlock } from "./catalog";
import { DIET_JSON_SCHEMA, WORKOUT_JSON_SCHEMA } from "./schemas";

/**
 * Prompt assembly. PT-BR throughout — the domain vocabulary is Portuguese, the
 * catalog is Portuguese, and the output is read by Brazilian coaches.
 *
 * **The split between `system` and `user` is load-bearing, not stylistic.**
 * `system` carries the rules and the catalog and is byte-identical on every call
 * of a given kind, so it forms the cacheable prefix. `user` carries everything
 * per-aluno and therefore must contain nothing stable and nothing large. Moving
 * a single per-aluno token into `system` silently destroys the cache for every
 * clinic at once.
 */

/**
 * Renders the coach's form as prompt prose — **only the answers this kind's
 * rules can act on**. Sending a treino its dietary restrictions, or a dieta its
 * equipment list, states a constraint the system prompt never tells the model
 * what to do with; it costs cache-miss tokens and invites invented reasoning.
 */
function renderWorkoutForm(input: AiWorkoutGenerateInput): string {
  const equip = input.equipment.map((e) => AI_EQUIPMENT_LABELS[e]).join(", ");
  return [
    `Objetivo: ${input.objective}`,
    `Equipamentos disponíveis: ${equip}`,
    `Frequência: ${input.daysPerWeek} dia(s) por semana`,
  ].join("\n");
}

function renderDietForm(input: AiDietGenerateInput): string {
  const restrictions =
    input.restrictions.length > 0
      ? input.restrictions.map((r) => AI_RESTRICTION_LABELS[r]).join(", ")
      : "nenhuma informada";
  // Named slots with their usual times, in the order they were declared —
  // the model gets the split and the clock anchor, instead of a count it has
  // to guess a shape for.
  const meals = input.meals
    .map((m) => `${AI_MEAL_SLOT_LABELS[m]} (~${AI_MEAL_SLOT_TIMES[m]})`)
    .join(", ");
  return [
    `Objetivo: ${input.objective}`,
    `Restrições alimentares: ${restrictions}`,
    `Refeições a montar (nesta ordem): ${meals}`,
    // Skipped entirely when blank: an empty label invites the model to fill it.
    ...(input.preferences ? [`Preferências do aluno: ${input.preferences}`] : []),
    ...(input.avoid ? [`Alimentos a evitar: ${input.avoid}`] : []),
  ].join("\n");
}

/**
 * Renders the filled anamnese as `label: answer` lines, section by section.
 *
 * The whole questionnaire goes in, not just the five canonical profile keys —
 * the coach collected it for a reason, and an injury note or a medication is
 * exactly the context that changes a program. Unanswered questions are skipped
 * rather than sent as empty, so the model isn't invited to invent them.
 */
function renderAnamnesis(
  sections: AnamnesisSection[],
  answers: AnamnesisAnswers,
): string {
  const blocks: string[] = [];
  for (const section of sections) {
    const lines: string[] = [];
    for (const q of section.questions) {
      const raw = answers[q.key];
      if (raw === null || raw === undefined || raw === "") continue;
      const value = typeof raw === "boolean" ? (raw ? "sim" : "não") : raw;
      lines.push(`- ${q.label}: ${value}`);
    }
    if (lines.length > 0) blocks.push(`${section.title}\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n") || "(sem respostas registradas)";
}

/** Rules shared by both kinds. The catalog discipline is the important part. */
function sharedRules(catalogNoun: string): string {
  return [
    `Você só pode usar ${catalogNoun} do catálogo abaixo.`,
    `Refira-se a cada item **apenas pelo número** exibido no catálogo.`,
    `Nunca invente um número que não esteja na lista, e nunca escreva nomes no lugar do número.`,
    `Responda somente com o JSON do formato abaixo, sem texto ao redor, sem markdown e sem comentários.`,
    `Escreva todos os textos (nomes, observações) em português do Brasil.`,
  ].join("\n");
}

/**
 * The response schema, restated **in the prompt**.
 *
 * `response_format: json_schema` already carries this — but only on hosts that
 * implement strict structured outputs, and the cheap ones do not (see
 * `docs/ai-provider-costs.md`). On those, the schema is silently dropped and the
 * model is left being told to "reply with the JSON in the requested format"
 * while never having been shown the format. The observed result is not a
 * malformed answer but a **runaway** one: it improvises, and keeps going until
 * `max_tokens` cuts it off, which costs a full ceiling of output tokens and
 * produces nothing.
 *
 * So the contract is stated twice, on purpose. Belt and braces is the right
 * shape here because the two mechanisms fail on different hosts and the cost of
 * the redundancy is a few hundred tokens **inside the cacheable prefix** — a
 * cache hit, not a bill.
 *
 * Safe to `JSON.stringify`: the schemas are `as const` object literals, so their
 * key order is fixed at the source and the bytes cannot shift between calls —
 * which the prompt cache depends on (see `catalog.ts`).
 */
function schemaBlock(schema: Record<string, unknown>): string {
  return [
    "Formato exato da resposta (JSON Schema). O objeto retornado deve satisfazê-lo:",
    JSON.stringify(schema),
  ].join("\n");
}

/** System prompt for workout generation — the cacheable prefix. */
export function workoutSystemPrompt(catalog: CatalogBlock): string {
  return [
    "Você é um treinador de musculação experiente montando um treino para um aluno.",
    "",
    sharedRules("exercícios"),
    "",
    "Diretrizes:",
    "- Monte as fichas de acordo com a frequência semanal informada.",
    "- Priorize exercícios compostos no início de cada ficha.",
    "- Distribua os grupos musculares ao longo da semana, sem sobrecarregar um só.",
    "- Respeite os equipamentos disponíveis: não prescreva o que o aluno não tem.",
    "- Ajuste séries, repetições e descanso ao objetivo e ao nível do aluno.",
    "- Use a observação de cada exercício apenas quando ela ajudar de verdade.",
    "",
    schemaBlock(WORKOUT_JSON_SCHEMA),
    "",
    `Catálogo de exercícios (${catalog.size} itens) — número: nome (músculos, equipamento):`,
    catalog.text,
  ].join("\n");
}

/** System prompt for diet generation — the cacheable prefix. */
export function dietSystemPrompt(catalog: CatalogBlock): string {
  return [
    "Você é um nutricionista experiente montando um plano alimentar para um aluno.",
    "",
    sharedRules("alimentos"),
    "",
    "Diretrizes:",
    "- Monte exatamente as refeições pedidas, na ordem dada, usando o nome de cada uma como o nome da refeição.",
    "- **Cada alimento tem que fazer sentido na refeição em que está.** Café da manhã e lanches levam alimentos de café da manhã e lanche (pães, ovos, frutas, laticínios, aveia, tapioca, café). Almoço e jantar levam refeições completas (arroz, feijão, tubérculos, massas, carnes, saladas). Não coloque arroz, feijão ou bife no café da manhã, nem mingau de aveia no almoço — tecnicamente bate os macros e nenhum aluno come.",
    "- A ceia é leve: laticínios, castanhas, fruta. Nunca uma refeição completa.",
    "- Ajuste as quantidades ao objetivo, ao peso e à altura do aluno.",
    "- Respeite rigorosamente as restrições alimentares informadas.",
    "- Se houver preferências, use esses alimentos sempre que couberem nos macros — plano que o aluno gosta é plano que ele segue.",
    "- Se houver alimentos a evitar, não os use em nenhuma refeição, nem como substituto.",
    "- Prefira quantidades em múltiplos práticos (ex. 100 g, 150 g), não valores exóticos.",
    "- Distribua a proteína ao longo do dia, não concentrada em uma refeição.",
    "",
    schemaBlock(DIET_JSON_SCHEMA),
    "",
    `Catálogo de alimentos (${catalog.size} itens) — número: descrição — macros por 100 g:`,
    catalog.text,
  ].join("\n");
}

/**
 * User prompt: everything about this aluno. Deliberately last, and deliberately
 * the only part that varies.
 */
export function userPrompt(
  args: {
    studentName: string;
    sections: AnamnesisSection[];
    answers: AnamnesisAnswers;
  } & (
    | { kind: "workout"; input: AiWorkoutGenerateInput }
    | { kind: "diet"; input: AiDietGenerateInput }
  ),
): string {
  const what =
    args.kind === "workout"
      ? "Monte o treino para este aluno."
      : "Monte o plano alimentar para este aluno.";
  const form =
    args.kind === "workout"
      ? renderWorkoutForm(args.input)
      : renderDietForm(args.input);
  return [
    what,
    "",
    `Aluno: ${args.studentName}`,
    "",
    form,
    "",
    "Anamnese:",
    renderAnamnesis(args.sections, args.answers),
  ].join("\n");
}

/**
 * The repair turn, sent once when the first answer referenced catalog numbers
 * that don't exist. Free to the coach — it costs tokens, not a credit.
 *
 * It restates the constraint and names the offending numbers rather than
 * re-sending the whole task, so the retry is cheap and the model's attention is
 * on the one thing it got wrong.
 */
export function repairPrompt(base: string, invalid: number[]): string {
  return [
    base,
    "",
    `ATENÇÃO: na tentativa anterior você usou números que não existem no catálogo: ${invalid.join(", ")}.`,
    "Refaça a resposta usando somente números presentes no catálogo.",
  ].join("\n");
}
