import { aiDietGenerateSchema } from "@/lib/ai-programs";
import { generateDiet } from "@/server/ai/generate";
import { handleGenerate } from "@/server/ai/route-handler";
import { withRoute } from "@/server/observability";

/**
 * "Gerar dieta com IA" — drafts a diet for the student from the platform TACO
 * catalog and saves it as an **unpublished draft** the coach reviews.
 *
 * Mirror of the workout route; both share `handleGenerate` so the gates and the
 * PT-BR copy can't drift apart.
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withRoute<Params>(
  "student-diet.generate",
  (request, { params }) => handleGenerate(request, params, aiDietGenerateSchema, generateDiet),
);
