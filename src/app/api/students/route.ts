import { NextResponse } from "next/server";

import { isAtStudentLimit, studentRegistrationSchema } from "@/lib/students";
import { plans, students, studentAnamneses } from "@/server/dal";
import {
  apiError,
  forbidden,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { sendStudentOnboarding } from "@/server/onboarding";
import { getTenantContext } from "@/server/tenant";

/**
 * Students collection. The roster reads this via TanStack Query; the merged
 * registration screen posts to it. Registration is one action: it creates the
 * student, assigns (snapshots) the chosen anamnese, and — for ONLINE students —
 * sends the WhatsApp onboarding (portal access link + anamnese fill link).
 * OFFLINE students are just created + assigned (the coach fills the anamnese
 * next). Tenant-scoped through the DAL; input validated with zod; plan cap and
 * per-clinic phone/e-mail uniqueness enforced here.
 */

export const GET = withRoute("students.list", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  const roster = await students.listStudents(ctx);
  return NextResponse.json({ students: roster });
});

export const POST = withRoute("students.register", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = studentRegistrationSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  // Per-clinic uniqueness (only for the identifiers that are present).
  if (data.email && (await students.findStudentByEmail(ctx, data.email))) {
    return apiError("Já existe um aluno com este e-mail.", 409);
  }
  if (data.phone && (await students.findStudentByPhone(ctx, data.phone))) {
    return apiError("Já existe um aluno com este WhatsApp.", 409);
  }

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
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    goal: data.goal,
    modality: data.modality,
    coachId: ctx.role === "coach" ? ctx.userId : null,
  });

  // Snapshot the chosen anamnese onto the new student.
  const assign = await studentAnamneses.assignAnamnesis(
    ctx,
    created.id,
    data.anamnesisId,
  );
  if (!assign.ok) return apiError("Anamnese selecionada não encontrada.", 422);

  // Online students receive their links now; offline students don't (the coach
  // fills the anamnese next, and can send access later from the profile).
  let sent = false;
  if (data.modality === "online") {
    const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
    const result = await sendStudentOnboarding(ctx, created.id, base);
    sent = result.ok;
  }

  logger.info("student.registered", {
    studentId: created.id,
    modality: data.modality,
    sent,
  });
  return NextResponse.json(
    { student: created, access: data.modality, sent },
    { status: 201 },
  );
});
