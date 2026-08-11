import { NextResponse } from "next/server";

import {
  isAtStudentLimit,
  studentRegistrationSchema,
  toStudentDto,
} from "@/lib/students";
import { plans, students, studentAnamneses } from "@/server/dal";
import {
  apiError,
  fieldConflict,
  forbidden,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { sendAnamnesisInvite } from "@/server/onboarding";
import { getTenantContext } from "@/server/tenant";

/**
 * Students collection. The roster reads this via TanStack Query; the merged
 * registration screen posts to it. Registration is one action: it creates the
 * student, assigns (snapshots) the chosen anamnese, and — for ONLINE students —
 * sends the WhatsApp anamnese fill link. Portal access is NOT sent here: the
 * student is only being invited to fill their anamnese; the account-activation
 * link goes out later, on the first diet/workout published (see onboarding.ts).
 * OFFLINE students are just created + assigned (the coach fills the anamnese
 * next). Tenant-scoped through the DAL; input validated with zod; plan cap and
 * per-clinic phone/e-mail uniqueness enforced here.
 */

export const GET = withRoute("students.list", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();
  const roster = await students.listStudents(ctx);
  return NextResponse.json({ students: roster.map(toStudentDto) });
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

  // Per-clinic uniqueness (only for the identifiers that are present). The
  // message is scoped to its field so it renders under that input.
  if (data.email && (await students.findStudentByEmail(ctx, data.email))) {
    const m = "Já existe um aluno com este e-mail.";
    return fieldConflict(m, { email: m });
  }
  if (data.phone && (await students.findStudentByPhone(ctx, data.phone))) {
    const m = "Já existe um aluno com este WhatsApp.";
    return fieldConflict(m, { phone: m });
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

  // Online students are invited to fill their anamnese now; offline students
  // aren't (the coach fills it next). Portal access follows on first publish.
  let sent = false;
  if (data.modality === "online") {
    const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
    const result = await sendAnamnesisInvite(ctx, created.id, base);
    sent = result.ok;
  }

  logger.info("student.registered", {
    studentId: created.id,
    modality: data.modality,
    sent,
  });
  return NextResponse.json(
    { student: toStudentDto(created), access: data.modality, sent },
    { status: 201 },
  );
});
