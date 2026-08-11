import { NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { auth, withoutVerificationEmail } from "@/lib/auth";
import { acceptInviteSchema } from "@/lib/students";
import { invitations, students } from "@/server/dal";
import { apiError, readJson, validationError } from "@/server/api";
import { logger, withRoute } from "@/server/observability";

/**
 * Public invite endpoints (no session yet — the token is the credential).
 *
 * GET  ?token=…  → whether the invite is still valid, and who it's for, so the
 *                  accept page can greet the student or show an expired state.
 * POST { token, password } → activates the aluno login: creates the user with a
 *   password, moves them into the inviting clinic as an `aluno`, links the
 *   student row and marks the invite accepted. It does NOT establish a session
 *   or forge any cookie — after activating, the browser sends the aluno to
 *   /login to sign in themselves (mirrors the e-mail OTP flow: verifying or
 *   activating an account never logs a user in).
 */

export const GET = withRoute("invite.check", async (request) => {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false });

  const pending = await invitations.findPendingByToken(db, token);
  if (!pending) return NextResponse.json({ valid: false });

  return NextResponse.json({
    valid: true,
    email: pending.student.email,
    firstName: pending.student.firstName,
  });
});

export const POST = withRoute("invite.accept", async (request) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = acceptInviteSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const { token, password } = parsed.data;

  const pending = await invitations.findPendingByToken(db, token);
  if (!pending) {
    return apiError("Convite inválido ou expirado. Peça um novo ao seu coach.", 410);
  }
  const { invitation, student } = pending;

  // An online student always has an e-mail (the portal login) — but guard the
  // nullable column so a mis-provisioned student can't crash the accept flow.
  if (!student.email) {
    return apiError(
      "Este aluno não tem e-mail para ativar o acesso. Fale com seu coach.",
      409,
    );
  }

  // Create the login. Sign-up auto-bootstraps a clinic for any new user; we
  // then move the aluno into the inviting clinic and drop that throwaway one —
  // the same provisioning the seed performs for its aluno.
  const name = `${student.firstName} ${student.lastName}`.trim();
  const email = student.email; // narrowed to string by the guard above
  try {
    // Activating from an invite force-verifies the e-mail below, so suppress
    // Better Auth's automatic sign-up verification OTP — the aluno needs none.
    await withoutVerificationEmail(() =>
      auth.api.signUpEmail({ body: { name, email, password } }),
    );
  } catch (error) {
    if (
      error instanceof APIError &&
      (error.body?.code as string | undefined) === "USER_ALREADY_EXISTS"
    ) {
      return apiError(
        "Já existe uma conta com este e-mail. Faça login para continuar.",
        409,
      );
    }
    return apiError("Não foi possível ativar seu acesso. Tente novamente.", 500);
  }

  const [newUser] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, student.email));

  // The account is already created by signUpEmail above (its own call); the
  // remaining provisioning — promote to aluno, drop the throwaway clinic, link
  // the student row, mark the invite accepted — runs in one transaction so a
  // mid-flow error can't leave the aluno half-provisioned.
  await db.transaction(async (tx) => {
    await tx
      .update(schema.user)
      .set({ role: "aluno", clinicId: invitation.clinicId, emailVerified: true })
      .where(eq(schema.user.id, newUser.id));
    // Remove the clinic auto-created for them at sign-up.
    await tx.delete(schema.clinic).where(eq(schema.clinic.ownerUserId, newUser.id));

    await students.linkStudentAccount(tx, {
      clinicId: invitation.clinicId,
      studentId: student.id,
      userId: newUser.id,
    });
    await invitations.markAccepted(tx, invitation.id);
  });

  logger.info("invite.accepted", {
    studentId: student.id,
    clinicId: invitation.clinicId,
    userId: newUser.id,
  });

  // The account is ready and verified, but intentionally NOT signed in — the
  // accept page redirects the aluno to /login to sign in themselves.
  return NextResponse.json({ ok: true });
});
