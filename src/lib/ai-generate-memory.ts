import {
  AI_DEFAULT_DAYS_PER_WEEK,
  AI_EQUIPMENT_VALUES,
  AI_MACRO_PROFILE_VALUES,
  AI_RESTRICTION_VALUES,
  type AiEquipment,
  type AiMacroProfile,
  type AiRestriction,
} from "@/lib/ai-programs";
import { MEAL_SLOT_VALUES, type MealSlot } from "@/lib/meals";
import { z } from "@/lib/validation";

/**
 * What the coach last answered in the "Gerar com IA" dialog, per aluno and per
 * kind, kept in `localStorage`.
 *
 * **Why it is remembered at all.** These answers are not a one-off: a coach
 * regenerates the same aluno's dieta month after month, and every time they were
 * retyping the same restrictions, the same six meals, the same "não come peixe".
 * The form asks eleven questions whose answers change roughly never, so a blank
 * dialog charged the coach a minute of retyping — and, worse, quietly dropped
 * whatever they forgot to re-tick, which the model then contradicted.
 *
 * **Why `localStorage` and not the database.** These are the *inputs* to a
 * generation, not clinic data: the plan they produced is already persisted, and
 * a coach who switches machines gets the same blank dialog they have today
 * rather than something broken. Nothing here is authoritative and nothing is
 * ever trusted — the server revalidates the whole payload with zod on the way
 * in, exactly as if it had been typed.
 *
 * **What is deliberately NOT remembered: `fromScratch`.** Every other field
 * describes the aluno and is safe to carry forward. "Recomeçar do zero" is the
 * opposite: a one-time instruction to throw away the diet the aluno is actually
 * following. Persisted, one reset in March silently resets every regeneration
 * after it — the exact outcome the flag's own warning copy exists to prevent.
 * It starts unticked every time, on purpose.
 */

/** Bumped when the stored shape changes; old entries are then simply ignored. */
const VERSION = "v1";

const PREFIX = "ai-generate:";

/** One aluno's answers for one kind. Namespaced so sign-out can wipe the lot. */
function storageKey(kind: "workout" | "diet", studentId: string): string {
  return `${PREFIX}${VERSION}:${kind}:${studentId}`;
}

/**
 * Keeps the values this build still knows about and drops the rest.
 *
 * A retired option (`Elásticos` was one) must not invalidate the whole record:
 * losing one checkbox is a shrug, losing the other ten answers is the retyping
 * this module exists to end. Same reasoning for every `.catch()` below.
 */
function knownValues<T extends string>(values: readonly T[]) {
  return z
    .array(z.string())
    .catch([])
    .transform((list) =>
      list.filter((v): v is T => (values as readonly string[]).includes(v)),
    );
}

/** A remembered text answer. Bounded so a corrupt entry can't grow unchecked. */
const text = z.string().max(300).catch("");

/** A remembered number *input*, kept as typed — `""` is a blank box, not a 0. */
const numeric = z.string().max(10).catch("");

/** Treino: what the aluno trains with, and how often. */
export const aiWorkoutMemorySchema = z.object({
  objective: text,
  equipment: knownValues(AI_EQUIPMENT_VALUES),
  daysPerWeek: z.number().int().min(1).max(7).catch(AI_DEFAULT_DAYS_PER_WEEK),
});

/** Dieta: what they can't eat, how the day splits, and the targets. */
export const aiDietMemorySchema = z.object({
  objective: text,
  restrictions: knownValues(AI_RESTRICTION_VALUES),
  meals: knownValues(MEAL_SLOT_VALUES),
  mealsPerDayRaw: numeric,
  macroProfiles: knownValues(AI_MACRO_PROFILE_VALUES),
  preferences: text,
  avoid: text,
  targetKcal: numeric,
  targetProteinG: numeric,
  targetCarbsG: numeric,
  targetFatG: numeric,
});

export type AiWorkoutMemory = {
  objective: string;
  equipment: AiEquipment[];
  daysPerWeek: number;
};

export type AiDietMemory = {
  objective: string;
  restrictions: AiRestriction[];
  meals: MealSlot[];
  mealsPerDayRaw: string;
  macroProfiles: AiMacroProfile[];
  preferences: string;
  avoid: string;
  targetKcal: string;
  targetProteinG: string;
  targetCarbsG: string;
  targetFatG: string;
};

/**
 * Parses one stored record. `null` for "nothing usable here" — absent, corrupt,
 * or written by a different version — which every caller reads as "use the
 * defaults", never as an error worth showing.
 */
export function parseAiMemory<T>(
  schema: z.ZodType<T>,
  raw: string | null,
): T | null {
  if (raw === null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The last answers for this aluno's treino, or `null`.
 *
 * Every localStorage access here is wrapped: Safari in private mode throws on
 * read, and a dialog that refuses to open because it could not remember a
 * checkbox would be a far worse bug than the one this fixes.
 */
export function readAiWorkoutMemory(studentId: string): AiWorkoutMemory | null {
  try {
    return parseAiMemory(
      aiWorkoutMemorySchema,
      localStorage.getItem(storageKey("workout", studentId)),
    );
  } catch {
    return null;
  }
}

/** The last answers for this aluno's dieta, or `null`. */
export function readAiDietMemory(studentId: string): AiDietMemory | null {
  try {
    return parseAiMemory(
      aiDietMemorySchema,
      localStorage.getItem(storageKey("diet", studentId)),
    );
  } catch {
    return null;
  }
}

/** Records the answers a generation was just asked for. Best-effort. */
export function writeAiMemory(
  kind: "workout" | "diet",
  studentId: string,
  memory: AiWorkoutMemory | AiDietMemory,
): void {
  try {
    localStorage.setItem(storageKey(kind, studentId), JSON.stringify(memory));
  } catch {
    /* quota, private mode — the generation itself is unaffected */
  }
}

/**
 * Wipes every remembered answer, for every aluno.
 *
 * Called on sign-out, for the same reason `queryClient.clear()` is: these
 * records are keyed by aluno and hold their objective, food preferences and
 * aversions. None of it may survive into the next account to use this browser.
 */
export function clearAiMemory(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Collected first: removing while iterating shifts the indices and would
      // skip every other match.
      if (key !== null && key.startsWith(PREFIX)) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
