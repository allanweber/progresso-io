import { requireClinic } from "@/server/tenant";

/**
 * Guards the student profile subtree (Dados / Dieta / edit) — defense in depth
 * on top of the coach-only /coach layout, deriving the clinic from the session
 * so the pages (client components) always run inside a tenant.
 */
export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireClinic();
  return children;
}
