import { NextResponse } from "next/server";

import { studentFormSchema, studentStatusSchema } from "@/lib/students";
import { students } from "@/server/dal";
import {
  fieldConflict,
  isUuid,
  notFound,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * A single student: read (profile), edit (PUT — same schema/form as create),
 * lifecycle change (PATCH status) and soft-archive (DELETE). All tenant-scoped.
 */

type Params = { params: Promise<{ id: string }> };

export const GET = withRoute<Params>("students.get", async (_request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const student = await students.getStudentRoster(ctx, id);
  if (!student) return notFound("Aluno não encontrado.");
  return NextResponse.json({ student });
});

export const PUT = withRoute<Params>("students.update", async (request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = studentFormSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  // E-mail and WhatsApp must stay unique within the clinic (ignoring this same
  // student), and only when present. Field-scoped so the message renders under
  // the offending input.
  if (data.email) {
    const clash = await students.findStudentByEmail(ctx, data.email);
    if (clash && clash.id !== id) {
      const m = "Já existe um aluno com este e-mail.";
      return fieldConflict(m, { email: m });
    }
  }
  if (data.phone) {
    const clash = await students.findStudentByPhone(ctx, data.phone);
    if (clash && clash.id !== id) {
      const m = "Já existe um aluno com este WhatsApp.";
      return fieldConflict(m, { phone: m });
    }
  }

  const updated = await students.updateStudent(ctx, id, data);
  if (!updated) return notFound("Aluno não encontrado.");
  logger.info("student.updated", { studentId: id });
  return NextResponse.json({ student: updated });
});

export const PATCH = withRoute<Params>("students.setStatus", async (request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = studentStatusSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const updated = await students.setStudentStatus(ctx, id, parsed.data.status);
  if (!updated) return notFound("Aluno não encontrado.");
  logger.info("student.status_changed", { studentId: id, status: parsed.data.status });
  return NextResponse.json({ student: updated });
});

export const DELETE = withRoute<Params>("students.archive", async (_request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  // Soft-remove: the row and its history are kept, just archived.
  const archived = await students.archiveStudent(ctx, id);
  if (!archived) return notFound("Aluno não encontrado.");
  logger.info("student.archived", { studentId: id });
  return NextResponse.json({ student: archived });
});
