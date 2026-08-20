import type { AnamnesisSection } from "@/lib/anamneses";
import type { AnamnesisAnswers } from "@/lib/student-anamneses";
import {
  AI_EQUIPMENT_LABELS,
  AI_RESTRICTION_LABELS,
  type AiMacroProfile,
  type AiDietGenerateInput,
  type AiWorkoutGenerateInput,
} from "@/lib/ai-programs";
import {
  MEAL_SLOT_KINDS,
  MEAL_SLOT_LABELS,
  MEAL_SLOT_TIMES,
  MEAL_SLOT_VALUES,
  type MealSlot,
} from "@/lib/meals";
import type { DietTree } from "@/lib/student-diets";
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
  return [
    `Objetivo: ${input.objective}`,
    `Restrições alimentares: ${restrictions}`,
    ...renderMeals(input),
    ...renderMacroProfiles(input),
    // Skipped entirely when blank: an empty label invites the model to fill it.
    ...(input.preferences ? [`Preferências do aluno: ${input.preferences}`] : []),
    ...(input.avoid ? [`Alimentos a evitar: ${input.avoid}`] : []),
    ...renderTargets(input),
  ].join("\n");
}

/** "Café da manhã (~07:00) — pães, tapioca, …" — label, clock anchor and kind. */
function renderMealSlot(slot: MealSlot): string {
  return `${MEAL_SLOT_LABELS[slot]} (~${MEAL_SLOT_TIMES[slot]}) — ${MEAL_SLOT_KINDS[slot]}`;
}

/**
 * The day's shape, in whichever of the three ways the coach chose to give it:
 * named slots, a bare count, or named slots inside a larger count.
 *
 * A count alone is the weakest answer — it is exactly the "5 refeições" that
 * used to make the model invent a split and put arroz at 7h — so the two modes
 * that don't name every slot still ship the full menu of slots WITH their kinds
 * and their clock anchors. The model then picks from a real list rather than
 * from its own idea of what a Brazilian eats, and the "no arroz at breakfast"
 * rule has something concrete to bite on either way.
 */
function renderMeals(input: AiDietGenerateInput): string[] {
  const chosen = input.meals;
  const total = input.mealsPerDay;
  // Declared order is chronological, so the options list doubles as the order
  // the model should build them in.
  const rest = MEAL_SLOT_VALUES.filter((s) => !chosen.includes(s));

  if (chosen.length === 0) {
    return [
      `Refeições a montar: ${total} no dia — escolha quais, na ordem cronológica, entre estas:`,
      ...rest.map((s) => `  - ${renderMealSlot(s)}`),
    ];
  }
  if (total === null || total <= chosen.length) {
    return [
      "Refeições a montar (nesta ordem):",
      ...chosen.map((s) => `  - ${renderMealSlot(s)}`),
    ];
  }
  return [
    `Refeições a montar: ${total} no dia, na ordem cronológica.`,
    `Obrigatórias — monte todas estas ${chosen.length}:`,
    ...chosen.map((s) => `  - ${renderMealSlot(s)}`),
    `Complete as outras ${total - chosen.length} escolhendo entre:`,
    ...rest.map((s) => `  - ${renderMealSlot(s)}`),
  ];
}

/**
 * What each macro profile means in numbers.
 *
 * Ballpark figures, not a bare adjective: "alto carboidrato" alone lets the
 * model settle on whatever its training data considered high, which is how two
 * generations for the same aluno come back with different diets and no reason
 * the coach can see. The floors are the clinically load-bearing part — fat
 * carries the fat-soluble vitamins and the essential fatty acids, so "baixa"
 * has a bottom.
 */
const MACRO_PROFILE_RULES: Record<AiMacroProfile, string> = {
  alta_proteina:
    "proteína alta — cerca de 32% das calorias do dia (perto de 2,2 g por kg de peso), distribuída entre as refeições e não concentrada em uma",
  alto_carbo:
    "carboidrato alto — cerca de 55% das calorias do dia, com as porções maiores perto do treino",
  baixo_carbo:
    "carboidrato baixo — cerca de 22% das calorias do dia, com o restante em proteína e gordura",
  baixa_gordura:
    "gordura baixa — cerca de 20% das calorias do dia e nunca abaixo disso: é onde estão as vitaminas lipossolúveis e os ácidos graxos essenciais",
};

/**
 * The macro shape the coach asked for, if any.
 *
 * When gram targets were also given, the numbers win and the prompt says so —
 * "alta proteína" and "150 g de proteína" are not a contradiction the model
 * should be left to resolve on its own, and the number is the more specific
 * instruction of the two.
 */
function renderMacroProfiles(input: AiDietGenerateInput): string[] {
  if (input.macroProfiles.length === 0) return [];
  const hasGramTargets =
    input.targetProteinG !== null ||
    input.targetCarbsG !== null ||
    input.targetFatG !== null;
  return [
    "Perfil de macros:",
    ...input.macroProfiles.map((p) => `  - ${MACRO_PROFILE_RULES[p]}`),
    ...(hasGramTargets
      ? [
          "Onde houver meta em gramas, a meta manda; o perfil vale para os macros sem número.",
        ]
      : []),
  ];
}

/**
 * The macro targets, only the ones that were given.
 *
 * Partial is a real answer and a common one — a coach often carries a kcal
 * figure and a protein floor but no opinion at all on how the rest splits.
 * Sending the blanks as zero would turn "no opinion" into "zero grams of fat".
 */
function renderTargets(input: AiDietGenerateInput): string[] {
  const parts = [
    input.targetKcal !== null ? `${input.targetKcal} kcal` : null,
    input.targetProteinG !== null ? `${input.targetProteinG} g de proteína` : null,
    input.targetCarbsG !== null ? `${input.targetCarbsG} g de carboidrato` : null,
    input.targetFatG !== null ? `${input.targetFatG} g de gordura` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0
    ? [`Metas do dia (alvo, não sugestão): ${parts.join(", ")}`]
    : [];
}

/**
 * The aluno's current diet, rendered as catalog indices so the model can reuse
 * the exact same rows rather than picking a similar-looking food.
 *
 * A food that is no longer in the catalog (archived, or a clinic-custom row
 * that never was) has no index. It is still listed, marked, and explicitly
 * declared unusable — dropping it silently would make the model reinvent that
 * slot with no idea it was ever deliberate.
 */
export function renderDietBaseline(
  tree: DietTree,
  catalog: CatalogBlock,
): string {
  const indexOf = new Map<string, number>();
  for (const [index, id] of catalog.byIndex) indexOf.set(id, index);

  const lines = tree.meals.map((meal) => {
    const items = meal.items.map((item) => {
      const index = item.foodId ? indexOf.get(item.foodId) : undefined;
      return index !== undefined
        ? `  - ${index} — ${item.description} — ${item.grams} g`
        : `  - (fora do catálogo, sem número) ${item.description} — ${item.grams} g`;
    });
    return [`${meal.name}${meal.time ? ` (${meal.time})` : ""}:`, ...items].join(
      "\n",
    );
  });
  return lines.join("\n");
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
    "- Monte exatamente as refeições pedidas, na ordem dada, usando o nome de cada uma como o nome da refeição. Quando o pedido der um total maior que as refeições nomeadas, complete o restante com as opções listadas — sempre em ordem cronológica, e nunca repetindo uma refeição.",
    "- **Cada alimento tem que fazer sentido na refeição em que está.** Cada refeição pedida vem com a descrição do que cabe nela — siga essa descrição. Não coloque arroz, feijão ou bife no café da manhã, nem mingau de aveia no almoço: tecnicamente bate os macros e nenhum aluno come.",
    "- Ajuste as quantidades ao objetivo, ao peso e à altura do aluno.",
    // Two rows of starch in one meal is the single most common way a
    // macro-correct plan turns into a plate nobody serves.
    "- **Um carboidrato principal por refeição.** Pão com aveia no café, arroz com batata no almoço, macarrão com mandioca no jantar: escolha um só. A exceção é a dupla arroz + leguminosa (feijão, lentilha, grão-de-bico), que é o prato brasileiro normal — fruta e legumes também não contam como segundo carboidrato.",
    // A plan in grams for foods nobody weighs is a plan nobody follows.
    "- **Use medidas caseiras onde o catálogo oferece uma** (aparecem como [1 fatia = 25g]). Prescreva um número INTEIRO de medidas, ponha esse número em \"measures\" e ponha em \"grams\" o resultado da conta (2 fatias de 25 g = 50 g). Sem medida no catálogo, use gramas em múltiplos práticos e deixe \"measures\" null.",
    "- Respeite rigorosamente as restrições alimentares informadas.",
    "- Se houver preferências, use esses alimentos sempre que couberem nos macros — plano que o aluno gosta é plano que ele segue.",
    "- Se houver alimentos a evitar, não os use em nenhuma refeição, nem como substituto.",
    "- Prefira quantidades em múltiplos práticos (ex. 100 g, 150 g), não valores exóticos.",
    "- Alimentos a evitar são proibição, não preferência: não aparecem em refeição nenhuma, em quantidade nenhuma.",
    "- Distribua a proteína ao longo do dia, não concentrada em uma refeição.",
    "- Se houver metas de kcal ou macros, **some o dia inteiro e confira antes de responder**: kcal por 100 g × gramas ÷ 100, item por item. O total tem que cair dentro de ±5% da meta — o sistema refaz essa conta e devolve a dieta se não bater. Metas não informadas você calcula a partir da anamnese.",
    "- Se vier uma dieta atual, ela é o ponto de partida: mantenha alimentos, horários e a cara do plano, mudando só o necessário. Trocar tudo é o pior resultado possível — o aluno já segue aquilo.",
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
    | {
        kind: "diet";
        input: AiDietGenerateInput;
        /** The current diet as catalog indices, when one exists and is being kept. */
        baseline?: string | null;
      }
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
  // The baseline goes AFTER the form and BEFORE the anamnese: it is the thing
  // being adjusted, so the instruction to keep it has to sit next to it.
  const baseline =
    args.kind === "diet" && args.baseline
      ? [
          "",
          "Dieta atual do aluno — **ajuste esta dieta, não monte outra**:",
          "Mantenha os alimentos e os horários que já estão aqui e mexa só no que"
            + " precisa mudar para atingir o objetivo e as metas. O aluno já segue"
            + " esta rotina; trocar tudo joga fora a adesão que ele construiu.",
          args.baseline,
        ]
      : [];

  return [
    what,
    "",
    `Aluno: ${args.studentName}`,
    "",
    form,
    ...baseline,
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
export function repairPrompt(
  base: string,
  invalid: number[],
  problems: string[] = [],
): string {
  return [
    base,
    "",
    ...(invalid.length > 0
      ? [
          `ATENÇÃO: na tentativa anterior você usou números que não existem no catálogo: ${invalid.join(", ")}.`,
          "Refaça a resposta usando somente números presentes no catálogo.",
        ]
      : []),
    // The server checked the previous answer and these are things it can prove
    // wrong — arithmetic and a word search, not opinions. Stated as findings
    // with the real figures, because "bata a meta" is what failed the first
    // time; "você entregou 2827 e a meta era 2600" is actionable.
    ...(problems.length > 0
      ? [
          "ATENÇÃO: a resposta anterior foi conferida pelo sistema e tem estes problemas:",
          ...problems.map((p) => `- ${p}`),
          "Refaça a dieta inteira corrigindo TODOS eles. Some você mesmo os macros de cada item"
            + " (kcal por 100 g × gramas ÷ 100) e confira o total antes de responder.",
        ]
      : []),
  ].join("\n");
}
