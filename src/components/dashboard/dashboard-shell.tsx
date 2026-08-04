"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, LogOut, Users } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { authClient } from "@/lib/auth-client";
import { homePathForRole, ROLE_LABELS, type Role } from "@/lib/roles";

type ShellUser = {
  name: string;
  email: string;
  role?: string | null;
};

/** Sidebar links for a role. Each area only ever links within itself. */
function navItems(role: string | null | undefined) {
  const home = homePathForRole(role);
  const items = [{ href: home, label: "Visão geral", icon: LayoutDashboard }];
  if (role === "coach") {
    items.push({ href: "/coach/students", label: "Alunos", icon: Users });
  }
  return items;
}

/**
 * Chrome shared by every role's dashboard (sidebar + header + sign out). A
 * client component so the active nav item tracks the URL and — the point of the
 * cache rule — sign-out can clear the TanStack Query cache, ensuring no tenant
 * data survives into the next account.
 */
export function DashboardShell({
  user,
  children,
}: {
  user: ShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  const roleLabel = ROLE_LABELS[user.role as Role] ?? user.role;
  const home = homePathForRole(user.role);
  const items = navItems(user.role);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      // Wipe every cached query so the next user never sees this tenant's data.
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    }
  }

  function isActive(href: string) {
    return href === home ? pathname === href : pathname.startsWith(href);
  }

  return (
    <div className="flex min-h-screen bg-surface-light">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white px-5 py-6 md:flex">
        <Link href={home} className="mb-8">
          <Logo />
        </Link>
        <nav className="flex flex-col gap-1 text-sm">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={
                isActive(href)
                  ? "flex items-center gap-2.5 rounded-[10px] bg-primary-light px-3 py-2 font-medium text-primary"
                  : "flex items-center gap-2.5 rounded-[10px] px-3 py-2 font-medium text-[#334155] transition-colors hover:bg-secondary"
              }
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
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
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex items-center gap-1.5 rounded-[10px] border-[1.5px] border-input px-3 py-2 text-[13px] font-medium text-[#334155] transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <LogOut className="size-4" />
              Sair
            </button>
          </div>
        </header>

        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
