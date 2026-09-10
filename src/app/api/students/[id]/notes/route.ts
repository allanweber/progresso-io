import { NextResponse } from "next/server";

import { noteCreateSchema, type StudentNoteDto } from "@/lib/student-notes";
import { studentNotes } from "@/server/dal";
import {
  apiError,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { withCoach } from "@/server/guard";

/**
 * Notas do aluno — the coach's own record on a student.
 *
 * `withCoach` is the whole access story: there is no aluno-facing twin of this
 * route, and there must never be one. A note is where a coach writes what they
 * suspect rather than what they told the student.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withCoach<Params>(
  "coach.student.notes.list",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const notes = await studentNotes.listNotes(ctx, id);
    if (!notes) return notFound("Aluno não encontrado.");
    return NextResponse.json({ notes } as { notes: StudentNoteDto[] });
  },
);

export const POST = withCoach<Params>(
  "coach.student.notes.create",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = noteCreateSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    // Validating the shape of a uuid says nothing about whose check-in it is.
    // Without this a coach could pin a note to another aluno's check-in — same
    // clinic, wrong person — and the timeline would quietly show it there.
    if (parsed.data.checkinId !== null) {
      const belongs = await studentNotes.checkinBelongsToStudent(
        ctx,
        id,
        parsed.data.checkinId,
      );
      if (!belongs) return apiError("Check-in não encontrado.", 422);
    }

    const note = await studentNotes.createNote(ctx, {
      studentId: id,
      body: parsed.data.body,
      checkinId: parsed.data.checkinId,
    });
    if (!note) return notFound("Aluno não encontrado.");
    return NextResponse.json({ note } satisfies { note: StudentNoteDto }, {
      status: 201,
    });
  },
);
