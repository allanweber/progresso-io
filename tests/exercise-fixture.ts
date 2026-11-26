import { sql } from "drizzle-orm";

import * as schema from "@/db/schema";
import type { ExerciseFormValues } from "@/lib/exercises";

export type ExerciseSeed = Partial<typeof schema.exercise.$inferInsert> & {
  name: string;
};

export function exerciseRow(e: ExerciseSeed) {
  const { name, nameEn = null, ...rest } = e;
  return {
    code: null,
    source: "opengym",
    bodyPart: "upper legs" as const,
    category: "strength" as const,
    equipment: "body weight" as const,
    target: "quads" as const,
    ...rest,
    name,
    nameEn,
    searchText: sql`unaccent(lower(concat_ws(' ', ${name}::text, ${nameEn}::text)))`,
  };
}

export function exerciseInput(
  overrides: Partial<ExerciseFormValues> = {},
): ExerciseFormValues {
  return {
    name: "Exercício",
    nameEn: null,
    description: null,
    descriptionEn: null,
    bodyPart: "upper arms",
    category: "strength",
    equipment: "dumbbell",
    machineKind: null,
    target: "biceps",
    secondaryMuscles: [],
    needs: [],
    hold: false,
    instructions: [],
    instructionsEn: [],
    image: null,
    ...overrides,
  };
}
