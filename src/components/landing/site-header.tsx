import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

const navLinks = [
  { label: "Funcionalidades", href: "#features" },
  { label: "Preços", href: "#precos" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border-light bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-8 px-6">
        <Link href="/" className="mr-auto flex-shrink-0">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 sm:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-text-secondary transition-colors hover:text-primary"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5 sm:ml-0">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login" className="text-text-secondary">
              Entrar
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/registro">Começar grátis</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
