import { NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { acceptInviteSchema } from "@/lib/students";
import { adminInvitations } from "@/server/dal";
import { apiError, readJson, validationError } from "@/server/api";
import { logger, withRoute } from "@/server/observability";

/**
 * Public admin-invite endpoints (no session yet — the token is the credential).
 * Parallels the student invite-accept flow, but activates a platform ADMIN: the
 * new user gets `role = "admin"`, no clinic, and their sign-up's throwaway clinic
 * is dropped. It never establishes a session — after activating, the browser is
 * sent to /login to sign in.
 *
 * GET  ?token=…             → whether the invite is valid, and who it's for.
 * POST { token, password }  → creates the admin login and marks the invite used.
 */

export const GET = withRoute("adminInvite.check", async (request) => {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false });

  const invite = await adminInvitations.findPendingByToken(db, token);
  if (!invite) return NextResponse.json({ valid: false });

  return NextResponse.json({
    valid: true,
    email: invite.email,
    firstName: invite.name.split(" ")[0] || invite.name,
  });
});

export const POST = withRoute("adminInvite.accept", async (request) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = acceptInviteSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const { token, password } = parsed.data;

  const invite = await adminInvitations.findPendingByToken(db, token);
  if (!invite) {
    return apiError("Convite inválido ou expirado. Peça um novo.", 410);
  }

  // Create the login. Sign-up auto-bootstraps a clinic for any new user; we then
  // promote them to admin and drop that throwaway clinic (admins have no clinic).
  try {
    await auth.api.signUpEmail({
      body: { name: invite.name, email: invite.email, password },
    });
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
    .where(eq(schema.user.email, invite.email));

  await db
    .update(schema.user)
    .set({ role: "admin", clinicId: null, emailVerified: true })
    .where(eq(schema.user.id, newUser.id));
  // Remove the clinic auto-created for them at sign-up — admins own none.
  await db.delete(schema.clinic).where(eq(schema.clinic.ownerUserId, newUser.id));

  await adminInvitations.markAccepted(db, invite.id);

  logger.info("admin.invite_accepted", { email: invite.email, userId: newUser.id });

  // Ready and verified, but intentionally NOT signed in — the accept page sends
  // the new admin to /login to sign in themselves.
  return NextResponse.json({ ok: true });
});
