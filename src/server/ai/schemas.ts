import { z } from "@/lib/validation";

/**
 * The contract the model must answer with — twice over.
 *
 * Each shape is declared as a **JSON Schema** (sent to the provider's
 * `response_format`, which constrains generation) *and* as a **zod schema**
 * (validated on our side). Both, deliberately: not every provider honours strict
 * structured output, and one that silently doesn't must be caught rather than
 * trusted. The zod pass is the authority.
 *
 * Exercises and foods are referenced by the **integer index** from the catalog
 * block, never by name or uuid — see `catalog.ts`.
 *
 * The shape is deliberately narrow (no techniques, no supersets, no AI-chosen
 * substitutes). Every extra field is another thing a model can get subtly wrong,
 * and each of those is a thing the coach can add in two clicks in the editor
 * that already exists.
 */

/* -------------------------------------------------------------------------- */
/*  Workout                                                                   */
/* -------------------------------------------------------------------------- */

export const workoutPlanSchema = z.object({
  name: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).nullable(),
  sessions: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        exercises: z
          .array(
            z.object({
              /** 1-based index into the exercise catalog block. */
              exercise: z.number().int().positive(),
              sets: z.number().int().min(1).max(50),
              /** Reps per set, e.g. [12,10,8]. One entry = the same every set. */
              reps: z.array(z.number().int().min(1).max(500)).min(1).max(50),
              /** Rest in seconds. 0 is legal. */
              rest: z.number().int().min(0).max(3600),
              note: z.string().trim().max(500).nullable(),
            }),
          )
          .min(1)
          .max(100),
      }),
    )
    .min(1)
    .max(30),
});

export type WorkoutPlan = z.infer<typeof workoutPlanSchema>;

export const WORKOUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "notes", "sessions"],
  properties: {
    name: { type: "string", description: "Nome do treino, em português." },
    notes: {
      type: ["string", "null"],
      description: "Observações gerais do treino, ou null.",
    },
    sessions: {
      type: "array",
      description: "As fichas do treino (A, B, C…).",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "exercises"],
        properties: {
          name: { type: "string", description: "Nome da ficha, ex. 'Ficha A'." },
          exercises: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["exercise", "sets", "reps", "rest", "note"],
              properties: {
                exercise: {
                  type: "integer",
                  description:
                    "Número do exercício, exatamente como listado no catálogo.",
                },
                sets: { type: "integer", description: "Número de séries." },
                reps: {
                  type: "array",
                  items: { type: "integer" },
                  description:
                    "Repetições por série. Um único valor = igual em todas.",
                },
                rest: {
                  type: "integer",
                  description: "Descanso entre séries, em segundos.",
                },
                note: {
                  type: ["string", "null"],
                  description: "Observação curta para o aluno, ou null.",
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

/* -------------------------------------------------------------------------- */
/*  Diet                                                                      */
/* -------------------------------------------------------------------------- */

export const dietPlanSchema = z.object({
  name: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).nullable(),
  meals: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        /** Free text — "08:00" or "ao acordar" are both valid. */
        time: z.string().trim().max(40).nullable(),
        items: z
          .array(
            z.object({
              /** 1-based index into the food catalog block. */
              food: z.number().int().positive(),
              /** Portion in grams. Must be > 0 — the DAL enforces it too. */
              grams: z.number().positive().max(5000),
            }),
          )
          .min(1)
          .max(100),
      }),
    )
    .min(1)
    .max(30),
});

export type DietPlan = z.infer<typeof dietPlanSchema>;

export const DIET_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "notes", "meals"],
  properties: {
    name: { type: "string", description: "Nome da dieta, em português." },
    notes: {
      type: ["string", "null"],
      description: "Observações gerais da dieta, ou null.",
    },
    meals: {
      type: "array",
      description: "As refeições do dia, em ordem cronológica.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "time", "items"],
        properties: {
          name: {
            type: "string",
            description: "Nome da refeição, ex. 'Café da manhã'.",
          },
          time: {
            type: ["string", "null"],
            description: "Horário, ex. '08:00' ou 'ao acordar'. Pode ser null.",
          },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["food", "grams"],
              properties: {
                food: {
                  type: "integer",
                  description:
                    "Número do alimento, exatamente como listado no catálogo.",
                },
                grams: {
                  type: "number",
                  description: "Quantidade em gramas.",
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Every catalog index a workout plan references, for validation. */
export function workoutIndices(plan: WorkoutPlan): number[] {
  return plan.sessions.flatMap((s) => s.exercises.map((e) => e.exercise));
}

/** Every catalog index a diet plan references, for validation. */
export function dietIndices(plan: DietPlan): number[] {
  return plan.meals.flatMap((m) => m.items.map((i) => i.food));
}
