import type { Metadata } from "next";

import { InviteAcceptForm } from "@/components/auth/invite-accept-form";

export const metadata: Metadata = {
  title: "Ativar acesso de administrador — Progresso IO",
};

/**
 * Admin invite-accept page. Like the student one, a Server Component that reads
 * the token on the server and hands it to the client island — with `kind="admin"`
 * so it drives the admin accept flow (sets a password, activates an admin login).
 */
export default async function AdminInviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-light px-4 py-12">
      <InviteAcceptForm token={token ?? ""} kind="admin" />
    </main>
  );
}
