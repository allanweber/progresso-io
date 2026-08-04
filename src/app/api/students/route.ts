import { NextResponse } from "next/server";

import { isAtStudentLimit, studentFormSchema } from "@/lib/students";
import { plans, students } from "@/server/dal";
import { apiError, unauthorized, validationError } from "@/server/api";
import { getTenantContext } from "@/server/tenant";

/**
 * Students collection. The roster page reads this via TanStack Query, and the
 * create form posts to it. Tenant-scoped through the DAL; input validated with
 * zod; the plan cap and duplicate-email rules are enforced here.
 */

export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const roster = await students.listStudents(ctx);
  return NextResponse.json({ students: roster });
}

export async function POST(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Corpo da requisição inválido.", 400);
  }

  const parsed = studentFormSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  // One student per e-mail within a clinic.
  const clash = await students.findStudentByEmail(ctx, data.email);
  if (clash) return apiError("Já existe um aluno com este e-mail.", 409);

  // Plan cap (archived students don't count — they've freed their slot).
  const [count, limit] = await Promise.all([
    students.countStudents(ctx),
    plans.getStudentLimit(ctx),
  ]);
  if (isAtStudentLimit(count, limit)) {
    return apiError(
      `Seu plano permite até ${limit} alunos ativos. Faça upgrade para adicionar mais.`,
      403,
    );
  }

  const created = await students.createStudent(ctx, {
    ...data,
    // Assign the student to the coach creating them.
    coachId: ctx.role === "coach" ? ctx.userId : null,
  });
  return NextResponse.json({ student: created }, { status: 201 });
}
