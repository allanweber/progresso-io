import { NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { auth, withoutVerificationEmail } from "@/lib/auth";
import { acceptInviteSchema } from "@/lib/students";
import { coachInvitations } from "@/server/dal";
import { apiError, readJson, validationError } from "@/server/api";
import { logger, withRoute } from "@/server/observability";

/**
 * Public coach-invite endpoints (no session yet — the token is the credential).
 * Parallels the admin invite-accept flow, but activates a COACH inside an
 * existing clinic: the new user keeps `role = "coach"` and gets `clinicId` set to
 * the inviting clinic, and the throwaway clinic auto-created at sign-up is
 * dropped (they join a clinic, they don't own a new one). It never establishes a
 * session — after activating, the browser is sent to /login to sign in.
 *
 * GET  ?token=…             → whether the invite is valid, who + which clinic.
 * POST { token, password }  → creates the coach login and marks the invite used.
 */

export const GET = withRoute("coachInvite.check", async (request) => {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false });

  const pending = await coachInvitations.findPendingByToken(db, token);
  if (!pending) return NextResponse.json({ valid: false });

  return NextResponse.json({
    valid: true,
    email: pending.invitation.email,
    firstName: pending.invitation.name.split(" ")[0] || pending.invitation.name,
    clinicName: pending.clinic.name,
  });
});

export const POST = withRoute("coachInvite.accept", async (request) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = acceptInviteSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const { token, password } = parsed.data;

  const pending = await coachInvitations.findPendingByToken(db, token);
  if (!pending) {
    return apiError("Convite inválido ou expirado. Peça um novo.", 410);
  }
  const { invitation } = pending;

  // Create the login. Sign-up auto-bootstraps a throwaway clinic for the new
  // user; we then move them into the inviting clinic and drop that clinic.
  try {
    await withoutVerificationEmail(() =>
      auth.api.signUpEmail({
        body: { name: invitation.name, email: invitation.email, password },
      }),
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
    .where(eq(schema.user.email, invitation.email));

  // Attach to the inviting clinic, drop the throwaway clinic and mark the invite
  // accepted in one transaction, so a mid-flow error can't leave a stray coach.
  await db.transaction(async (tx) => {
    await tx
      .update(schema.user)
      .set({
        role: "coach",
        clinicId: invitation.clinicId,
        emailVerified: true,
      })
      .where(eq(schema.user.id, newUser.id));
    await tx.delete(schema.clinic).where(eq(schema.clinic.ownerUserId, newUser.id));

    await coachInvitations.markAccepted(tx, invitation.id);
  });

  logger.info("coach.invite_accepted", {
    clinicId: invitation.clinicId,
    userId: newUser.id,
  });

  // Ready and verified, but intentionally NOT signed in — the accept page sends
  // the new coach to /login to sign in themselves.
  return NextResponse.json({ ok: true });
});
