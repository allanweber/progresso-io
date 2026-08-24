import { aiWorkoutGenerateSchema } from "@/lib/ai-programs";
import { generateWorkout } from "@/server/ai/generate";
import { handleGenerate } from "@/server/ai/route-handler";
import { withCoach } from "@/server/guard";

/**
 * "Gerar treino com IA" — drafts a workout for the student from the platform
 * exercise catalog and saves it as an **unpublished draft** the coach reviews.
 *
 * Synchronous: the coach is watching a progress state, and the audit row makes
 * promotion to a polled job additive rather than a rewrite if a platform
 * timeout ever forces it. Gates, statuses and copy live in `handleGenerate`.
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withCoach<Params>(
  "student-workout.generate",
  (request, ctx, { params }) =>
    handleGenerate(request, ctx, params, aiWorkoutGenerateSchema, generateWorkout),
);
