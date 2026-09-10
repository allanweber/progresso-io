import type { NoteAcceptance, NoteSource } from "@/db/schema";
import type { AiEvaluationPayload } from "@/lib/ai-evaluation";
import { z } from "@/lib/validation";

/**
 * Client-safe domain for **Notas do aluno** — the coach's own running record on
 * a student, and where every accepted AI evaluation lands.
 *
 * The one rule that matters: **notes are coach-only**. They are clinic-scoped
 * like every other tenant row, so coaches in the same clinic share them (that is
 * the tenancy model, not an oversight — a colleague covering a check-in needs
 * the history), but no route under `/api/student/*` reads this table and no
 * portal screen renders it. A note is where a coach writes "suspeito que não
 * está seguindo a dieta"; showing it to the aluno would end the feature.
 */

/* -------------------------------------------------------------------------- */
/*  DTO                                                                       */
/* -------------------------------------------------------------------------- */

export type StudentNoteDto = {
  id: string;
  source: NoteSource;
  body: string;
  /**
   * The accepted evaluation, verbatim — the numbers and the model's own words,
   * kept even when the coach rewrote `body`. Null on manual notes: one table,
   * one timeline, one nullable column.
   */
  payload: AiEvaluationPayload | null;
  acceptance: NoteAcceptance | null;
  /** The check-in this note is about, when it is about one. */
  checkinId: string | null;
  /** Its date, so the card can say "sobre o check-in de 12/03" without a join. */
  checkinDate: string | null;
  /** The body fat as accepted — not necessarily what `payload` proposed. */
  bodyFatPct: number | null;
  leanMassPct: number | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A manual note. Only a body — everything else about a note is derived from who
 * is writing it and which aluno's page they are on, and neither of those may
 * come from the client (see the tenancy rule in AGENTS.md).
 */
export const noteCreateSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Escreva a nota antes de salvar.")
    .max(5000, "A nota é longa demais."),
  /** Optional link to a check-in. Validated as a real one of THIS aluno's. */
  checkinId: z.string().uuid("Check-in inválido.").nullable().default(null),
});
export type NoteCreateInput = z.infer<typeof noteCreateSchema>;

/**
 * Editing a note. Only the body: a note's source, its payload and its check-in
 * are facts about how it came to exist, and rewriting those would turn an
 * accepted AI evaluation into something that never happened.
 */
export const noteUpdateSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "A nota não pode ficar vazia.")
    .max(5000, "A nota é longa demais."),
});
export type NoteUpdateInput = z.infer<typeof noteUpdateSchema>;

/** PT-BR label for where a note came from. */
export const NOTE_SOURCE_LABELS: Record<NoteSource, string> = {
  manual: "Nota do coach",
  ai_evaluation: "Avaliação com IA",
};
