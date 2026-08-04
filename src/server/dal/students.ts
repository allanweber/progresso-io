import { and, desc, eq } from "drizzle-orm";

import { schema } from "@/db";
import type { Student } from "@/db/schema";
import type { TenantContext } from "@/server/tenant";

/**
 * Reference DAL module. Every function is scoped to `ctx.clinicId`: there is no
 * way to read or write another clinic's students. New feature tables MUST
 * follow this shape (see the DAL rule in AGENTS.md).
 */

export async function listStudents(ctx: TenantContext): Promise<Student[]> {
  return ctx.db
    .select()
    .from(schema.students)
    .where(eq(schema.students.clinicId, ctx.clinicId))
    .orderBy(desc(schema.students.createdAt));
}

export async function getStudent(
  ctx: TenantContext,
  id: string,
): Promise<Student | null> {
  const [student] = await ctx.db
    .select()
    .from(schema.students)
    .where(
      and(
        eq(schema.students.clinicId, ctx.clinicId),
        eq(schema.students.id, id),
      ),
    );
  return student ?? null;
}

export async function countStudents(ctx: TenantContext): Promise<number> {
  const rows = await ctx.db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(eq(schema.students.clinicId, ctx.clinicId));
  return rows.length;
}

export async function createStudent(
  ctx: TenantContext,
  input: { name: string; email: string; coachId?: string | null },
): Promise<Student> {
  const [student] = await ctx.db
    .insert(schema.students)
    .values({
      // clinicId always comes from the tenant context, never from the caller.
      clinicId: ctx.clinicId,
      name: input.name,
      email: input.email,
      coachId: input.coachId ?? null,
    })
    .returning();
  return student;
}
