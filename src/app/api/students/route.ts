import { NextResponse } from "next/server";

import { isAtStudentLimit, studentFormSchema } from "@/lib/students";
import { plans, students } from "@/server/dal";
import { apiError, readJson, unauthorized, validationError } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Students collection. The roster page reads this via TanStack Query, and the
 * create form posts to it. Tenant-scoped through the DAL; input validated with
 * zod; the plan cap and duplicate-email rules are enforced here.
 */

export const GET = withRoute("students.list", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const roster = await students.listStudents(ctx);
  return NextResponse.json({ students: roster });
});

export const POST = withRoute("students.create", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = studentFormSchema.safeParse(body.data);
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
    logger.info("student.create_blocked", { reason: "plan_limit", count, limit });
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
  logger.info("student.created", { studentId: created.id });
  return NextResponse.json({ student: created }, { status: 201 });
});
