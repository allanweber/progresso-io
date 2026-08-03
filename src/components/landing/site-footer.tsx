import { Logo } from "@/components/brand/logo";

const footerLinks = [
  { label: "Termos de Uso", href: "#" },
  { label: "Privacidade", href: "#" },
  { label: "Contato", href: "#" },
];

export function SiteFooter() {
  return (
    <footer className="bg-surface-dark px-6 py-12">
      <div className="mx-auto flex max-w-[1120px] flex-col items-start justify-between gap-4 sm:flex-row sm:items-center sm:gap-6">
        <Logo size={28} className="text-white text-sm" />

        <div className="flex flex-wrap gap-6">
          {footerLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[13px] text-muted-foreground transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="text-xs text-[#334155]">© 2025 Progresso IO</div>
      </div>
    </footer>
  );
}
