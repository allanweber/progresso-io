"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The header for the coach's Biblioteca: a shared "Biblioteca" title and the tab
 * bar that switches between the Alimentos and Exercícios catalogs. Each tab is a
 * real route (`/coach/library/foods`, `/coach/library/exercises`), so a tab only
 * fetches its data when it's actually opened — the other tab's queries never run
 * until you navigate to it. Reused by both list pages (hence a shared component).
 */
const TABS = [
  { value: "alimentos", label: "Alimentos", href: "/coach/library/foods" },
  { value: "exercicios", label: "Exercícios", href: "/coach/library/exercises" },
] as const;

export function LibraryTabs({
  subtitle,
  action,
}: {
  /** Short description shown under the "Biblioteca" title, per tab. */
  subtitle: string;
  /** Optional right-aligned action (e.g. the "Novo alimento" button). */
  action?: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname.startsWith("/coach/library/exercises")
    ? "exercicios"
    : "alimentos";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Biblioteca
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {action}
      </div>

      <Tabs value={active} className="mt-6">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} asChild>
              <Link href={t.href}>{t.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
