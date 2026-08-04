import Link from "next/link";
import { LayoutDashboard, LogOut } from "lucide-react";

import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/brand/logo";
import { homePathForRole, ROLE_LABELS, type Role } from "@/lib/roles";

type ShellUser = {
  name: string;
  email: string;
  role?: string | null;
};

/**
 * Chrome shared by every role's dashboard (sidebar + header + sign out).
 * The role's own area is derived from its role, so links never point a user
 * at another role's pages.
 */
export function DashboardShell({
  user,
  children,
}: {
  user: ShellUser;
  children: React.ReactNode;
}) {
  const roleLabel = ROLE_LABELS[user.role as Role] ?? user.role;
  const home = homePathForRole(user.role);

  return (
    <div className="flex min-h-screen bg-surface-light">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white px-5 py-6 md:flex">
        <Link href={home} className="mb-8">
          <Logo />
        </Link>
        <nav className="flex flex-col gap-1 text-sm">
          <Link
            href={home}
            className="flex items-center gap-2.5 rounded-[10px] bg-primary-light px-3 py-2 font-medium text-primary"
          >
            <LayoutDashboard className="size-4" />
            Visão geral
          </Link>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-white px-6 py-3.5">
          <div className="flex items-center gap-3 md:hidden">
            <Logo markOnly />
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-semibold text-foreground">
                {user.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {roleLabel} · {user.email}
              </div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-[10px] border-[1.5px] border-input px-3 py-2 text-[13px] font-medium text-[#334155] transition-colors hover:bg-secondary"
              >
                <LogOut className="size-4" />
                Sair
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
