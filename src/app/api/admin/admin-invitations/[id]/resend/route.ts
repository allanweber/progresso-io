import { NextResponse } from "next/server";

import { db } from "@/db";
import { sendAdminInviteEmail } from "@/lib/email";
import { adminInvitations } from "@/server/dal";
import { ADMIN_INVITE_TTL_DAYS } from "@/server/dal/admin-invitations";
import { forbidden, isUuid, notFound } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Resend a pending admin invite: issues a FRESH token (superseding the old one)
 * for the same name + e-mail and re-sends the set-password e-mail. Admin-only.
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withRoute<Params>(
  "admin.adminInvitations.resend",
  async (request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const invite = await adminInvitations.getPendingInvite(db, id);
    if (!invite) return notFound("Convite não encontrado.");

    // Re-issue (supersedes the old token, including this one).
    const { rawToken } = await adminInvitations.createAdminInvitation(db, {
      email: invite.email,
      name: invite.name,
      invitedByUserId: session.user.id,
    });

    const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
    await sendAdminInviteEmail({
      email: invite.email,
      firstName: invite.name.split(" ")[0] || invite.name,
      acceptUrl: `${base}/admin-invite/accept?token=${rawToken}`,
      expiresInDays: ADMIN_INVITE_TTL_DAYS,
    });

    logger.info("admin.invite_resent", { email: invite.email, by: session.user.id });
    return NextResponse.json({ ok: true });
  },
);
