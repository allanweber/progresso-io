import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { IntegrationsBar } from "@/components/landing/integrations-bar";
import { Features } from "@/components/landing/features";
import { Pricing } from "@/components/landing/pricing";
import { CallToAction } from "@/components/landing/cta";
import { SiteFooter } from "@/components/landing/site-footer";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <IntegrationsBar />
        <Features />
        <Pricing />
        <CallToAction />
      </main>
      <SiteFooter />
    </>
  );
}
