import { NextResponse } from "next/server";

import { db } from "@/db";
import { adminInviteSchema } from "@/lib/admin";
import { sendAdminInviteEmail } from "@/lib/email";
import { bootstrapAdminEmail, isAdminEmail } from "@/lib/roles";
import { admin, adminInvitations } from "@/server/dal";
import { ADMIN_INVITE_TTL_DAYS } from "@/server/dal/admin-invitations";
import { fieldConflict, forbidden, readJson, validationError } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Platform admins collection. Admin-only (gated by getAdminSession), cross-tenant.
 *
 * GET  → activated admins + pending invites (the Admins page payload). Each admin
 *        row is tagged `isSelf` / `isBootstrap` so the UI can lock its delete.
 * POST → invite a NEW admin by name + e-mail: rejects an e-mail that already
 *        exists as any user or a pending invite, then stores a pending
 *        admin-invitation and e-mails the set-password link. No user is created
 *        until they accept.
 */

export const GET = withRoute("admin.admins.list", async () => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const bootstrap = bootstrapAdminEmail(process.env.ADMIN_EMAIL);
  const [admins, invites] = await Promise.all([
    admin.listAdmins(db),
    adminInvitations.listPendingInvites(db),
  ]);

  return NextResponse.json({
    admins: admins.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      createdAt: a.createdAt.toISOString(),
      isSelf: a.id === session.user.id,
      isBootstrap: isAdminEmail(a.email, bootstrap),
    })),
    invites: invites.map((i) => ({
      id: i.id,
      name: i.name,
      email: i.email,
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
    })),
    total: admins.length,
  });
});

export const POST = withRoute("admin.admins.invite", async (request) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = adminInviteSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const { name, email } = parsed.data;

  // Admin creation is for brand-new accounts only — no promoting existing users.
  if (await admin.getUserByEmail(db, email)) {
    const m = "Já existe uma conta com este e-mail.";
    return fieldConflict(m, { email: m });
  }
  if (await adminInvitations.hasPendingInvite(db, email)) {
    const m = "Já existe um convite pendente para este e-mail.";
    return fieldConflict(m, { email: m });
  }

  const { rawToken } = await adminInvitations.createAdminInvitation(db, {
    email,
    name,
    invitedByUserId: session.user.id,
  });

  const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
  await sendAdminInviteEmail({
    email,
    firstName: name.split(" ")[0] || name,
    acceptUrl: `${base}/admin-invite/accept?token=${rawToken}`,
    expiresInDays: ADMIN_INVITE_TTL_DAYS,
  });

  logger.info("admin.invited", { email, invitedBy: session.user.id });
  return NextResponse.json({ ok: true }, { status: 201 });
});
