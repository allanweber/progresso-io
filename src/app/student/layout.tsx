import type { Metadata } from "next";

import { requireRole } from "@/lib/session";

export const metadata: Metadata = {
  title: "Portal do aluno — Progresso IO",
};

/**
 * Guards the entire /student subtree — the aluno's portal. Coaches and admins
 * are redirected to their own area. Route protection lives here in the server
 * layout (defense in depth); the portal chrome (sidebar / header / bottom bar)
 * and sign-out live in the page, which is a client component reading the
 * aluno's data through the API + TanStack Query.
 */
export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["aluno"]);
  return children;
}
