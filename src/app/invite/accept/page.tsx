import type { Metadata } from "next";

import { InviteAcceptForm } from "@/components/auth/invite-accept-form";

export const metadata: Metadata = {
  title: "Ativar acesso — Progresso IO",
};

/**
 * Invite-accept page. A Server Component that reads the token from the query on
 * the server and hands it to the client island — so the route renders
 * dynamically per request (like /login) instead of being a statically-cached
 * shell whose only content is a loading placeholder until client JS hydrates.
 */
export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-light px-4 py-12">
      <InviteAcceptForm token={token ?? ""} />
    </main>
  );
}
