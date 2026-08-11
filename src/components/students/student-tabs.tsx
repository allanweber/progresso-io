"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The Dados / Dieta tab bar shown on a student's profile. Reused by both tab
 * pages so they share one control; the active tab is derived from the path.
 */
export function StudentTabs({ studentId }: { studentId: string }) {
  const pathname = usePathname();
  const base = `/coach/students/${studentId}`;
  const tabs = [
    { href: base, label: "Dados & anamnese", active: pathname === base },
    {
      href: `${base}/diet`,
      label: "Dieta",
      active: pathname.startsWith(`${base}/diet`),
    },
    {
      href: `${base}/workout`,
      label: "Treino",
      active: pathname.startsWith(`${base}/workout`),
    },
    {
      href: `${base}/feedback`,
      label: "Feedback",
      active: pathname.startsWith(`${base}/feedback`),
    },
    {
      href: `${base}/evolution`,
      label: "Evolução",
      active: pathname.startsWith(`${base}/evolution`),
    },
  ];
  return (
    // Five tabs overflow narrow widths — scroll horizontally instead of
    // wrapping/clipping, and keep each label on a single line.
    <div className="overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <nav className="-mb-px flex gap-1" aria-label="Seções do aluno">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              t.active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
