import { NextResponse } from "next/server";

import { studentFormSchema, studentStatusSchema } from "@/lib/students";
import { z } from "@/lib/validation";
import { students } from "@/server/dal";
import { apiError, notFound, unauthorized, validationError } from "@/server/api";
import { getTenantContext } from "@/server/tenant";

/**
 * A single student: read (profile), edit (PUT — same schema/form as create),
 * lifecycle change (PATCH status) and soft-archive (DELETE). All tenant-scoped.
 */

const idSchema = z.string().uuid();

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();

  const student = await students.getStudentRoster(ctx, id);
  if (!student) return notFound("Aluno não encontrado.");
  return NextResponse.json({ student });
}

export async function PUT(request: Request, { params }: Params) {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Corpo da requisição inválido.", 400);
  }

  const parsed = studentFormSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  // E-mail must stay unique within the clinic (ignoring this same student).
  const clash = await students.findStudentByEmail(ctx, data.email);
  if (clash && clash.id !== id) {
    return apiError("Já existe um aluno com este e-mail.", 409);
  }

  const updated = await students.updateStudent(ctx, id, data);
  if (!updated) return notFound("Aluno não encontrado.");
  return NextResponse.json({ student: updated });
}

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Corpo da requisição inválido.", 400);
  }

  const parsed = studentStatusSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const updated = await students.setStudentStatus(ctx, id, parsed.data.status);
  if (!updated) return notFound("Aluno não encontrado.");
  return NextResponse.json({ student: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();

  // Soft-remove: the row and its history are kept, just archived.
  const archived = await students.archiveStudent(ctx, id);
  if (!archived) return notFound("Aluno não encontrado.");
  return NextResponse.json({ student: archived });
}
