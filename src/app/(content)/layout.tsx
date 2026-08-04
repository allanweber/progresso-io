import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

/**
 * Shell for the marketing content pages (Termos de Uso, Privacidade, Contato).
 * Reuses the landing header/footer so visitors can navigate back.
 */
export default function ContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-surface-light">
        <article className="mx-auto max-w-[760px] px-6 py-16">{children}</article>
      </main>
      <SiteFooter />
    </>
  );
}
