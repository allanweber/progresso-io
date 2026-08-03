import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { features, type Feature } from "@/lib/landing-content";

import { SectionHeading } from "./section-heading";

export function Features() {
  return (
    <section id="features" className="scroll-mt-16 px-6 py-24">
      <div className="mx-auto max-w-[1120px]">
        <SectionHeading
          className="mb-16"
          eyebrow="Funcionalidades"
          title="Tudo que um coach precisa, em um só lugar"
          description="Desenvolvido por coaches, para coaches. Cada funcionalidade resolve uma dor real do dia a dia."
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const { icon: Icon, title, description, featured, accent, eyebrow } = feature;

  return (
    <Card
      className={cn(
        "flex flex-col p-7",
        featured &&
          "border-2 border-primary bg-gradient-to-br from-primary-light to-white",
        accent && "border-2 border-primary",
      )}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-12 flex-shrink-0 items-center justify-center rounded-xl",
            featured ? "bg-primary" : "bg-primary-light",
          )}
        >
          <Icon
            className={cn("size-[22px]", featured ? "text-white" : "text-primary")}
            strokeWidth={2}
          />
        </span>
        {featured && eyebrow && (
          <span className="rounded-full bg-[#dcfce7] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary">
            {eyebrow}
          </span>
        )}
      </div>

      {!featured && eyebrow && (
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-primary">
          {eyebrow}
        </div>
      )}

      <h3
        className={cn(
          "mb-2 font-heading font-bold text-foreground",
          featured ? "text-lg" : "text-[17px]",
        )}
      >
        {title}
      </h3>
      <p className="text-sm leading-[1.6] text-text-secondary">{description}</p>
    </Card>
  );
}
