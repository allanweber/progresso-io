import { NextResponse } from "next/server";

import { db } from "@/db";
import { bootstrapAdminEmail, isAdminEmail } from "@/lib/roles";
import { admin } from "@/server/dal";
import { apiError, forbidden, notFound } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Hard-delete a platform admin. Permanent: removes the admin's user row, which
 * cascades their sessions + accounts. Admin-only. Three guard rails, enforced
 * here (the UI mirrors them by disabling the button):
 * - you can't delete yourself,
 * - you can't delete the env-seeded bootstrap admin (ADMIN_EMAIL),
 * - you can't delete the last remaining admin (never lock everyone out).
 */
type Params = { params: Promise<{ id: string }> };

export const DELETE = withRoute<Params>(
  "admin.admins.delete",
  async (_request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;

    const target = await admin.getUserById(db, id);
    if (!target || target.role !== "admin") {
      return notFound("Administrador não encontrado.");
    }

    if (target.id === session.user.id) {
      return apiError("Você não pode remover a si mesmo.", 409);
    }
    if (isAdminEmail(target.email, bootstrapAdminEmail(process.env.ADMIN_EMAIL))) {
      return apiError("O administrador principal não pode ser removido.", 409);
    }
    if ((await admin.countAdmins(db)) <= 1) {
      return apiError("A plataforma precisa de ao menos um administrador.", 409);
    }

    const deleted = await admin.deleteAdminUser(db, id);
    if (!deleted) return notFound("Administrador não encontrado.");

    logger.warn("admin.deleted", { userId: id, by: session.user.id });
    return NextResponse.json({ ok: true });
  },
);
