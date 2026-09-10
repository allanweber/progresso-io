import { NextResponse } from "next/server";

import { noteUpdateSchema, type StudentNoteDto } from "@/lib/student-notes";
import { studentNotes } from "@/server/dal";
import {
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { withCoach } from "@/server/guard";

/**
 * One note: rewrite its body, or delete it.
 *
 * **Only the body is editable.** A note's source, its payload and its check-in
 * are facts about how it came to exist — editing those would let an accepted AI
 * evaluation be turned into something that never happened, and the payload is
 * the only record of what the model actually said.
 */
type Params = { params: Promise<{ id: string; noteId: string }> };

export const PATCH = withCoach<Params>(
  "coach.student.notes.update",
  async (request, ctx, { params }) => {
    const { id, noteId } = await params;
    if (!isUuid(id) || !isUuid(noteId)) return notFound("Nota não encontrada.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = noteUpdateSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const ok = await studentNotes.updateNote(ctx, noteId, parsed.data.body);
    if (!ok) return notFound("Nota não encontrada.");

    const note = await studentNotes.getNote(ctx, id, noteId);
    return NextResponse.json({ note } as { note: StudentNoteDto | null });
  },
);

export const DELETE = withCoach<Params>(
  "coach.student.notes.delete",
  async (_request, ctx, { params }) => {
    const { noteId } = await params;
    if (!isUuid(noteId)) return notFound("Nota não encontrada.");

    const ok = await studentNotes.deleteNote(ctx, noteId);
    if (!ok) return notFound("Nota não encontrada.");
    return NextResponse.json({ ok: true });
  },
);
