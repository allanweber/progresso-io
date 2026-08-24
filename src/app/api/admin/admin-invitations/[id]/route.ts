import { NextResponse } from "next/server";

import { db } from "@/db";
import { adminInvitations } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withAdmin } from "@/server/guard";

/**
 * Revoke a pending admin invite — deletes the invitation row so the e-mailed
 * link stops working. No user exists yet, so this removes nothing but the
 * pending invite. Admin-only.
 */
type Params = { params: Promise<{ id: string }> };

export const DELETE = withAdmin<Params>(
  "admin.adminInvitations.revoke",
  async (_request, session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const revoked = await adminInvitations.revokeInvite(db, id);
    if (!revoked) return notFound("Convite não encontrado.");

    logger.info("admin.invite_revoked", { invitationId: id, by: session.user.id });
    return NextResponse.json({ ok: true });
  },
);
