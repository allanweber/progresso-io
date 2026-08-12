import type { Metadata } from "next";

import { InviteAcceptForm } from "@/components/auth/invite-accept-form";

export const metadata: Metadata = {
  title: "Ativar acesso de coach — Progresso IO",
};

/**
 * Coach invite-accept page. Like the student/admin ones, a Server Component that
 * reads the token on the server and hands it to the client island — with
 * `kind="coach"` so it drives the coach accept flow (sets a password, activates
 * a coach login inside the inviting clinic).
 */
export default async function CoachInviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-light px-4 py-12">
      <InviteAcceptForm token={token ?? ""} kind="coach" />
    </main>
  );
}
