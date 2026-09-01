import Link from "next/link";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { plans, type Plan } from "@/lib/landing-content";

import { SectionHeading } from "./section-heading";

export function Pricing() {
  return (
    <section id="precos" className="scroll-mt-16 px-6 py-24">
      <div className="mx-auto max-w-[1120px]">
        <SectionHeading
          className="mb-14 max-w-[560px]"
          eyebrow="Preços"
          title="Simples e transparente"
          description="14 dias grátis em qualquer plano. Sem cartão de crédito."
        />

        <div className="mx-auto grid max-w-[1100px] gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-5 rounded-2xl border-2 border-border p-8 px-7",
        plan.popular && "border-primary",
        plan.dark && "border-surface-dark bg-surface-dark",
      )}
    >
      {plan.popular && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3.5 py-1 text-caption font-bold text-white">
          Mais popular
        </span>
      )}

      <div>
        <div
          className={cn(
            "mb-1 font-heading text-lg font-bold",
            plan.dark ? "text-white" : "text-foreground",
          )}
        >
          {plan.name}
        </div>
        <div className="text-body-dense text-muted-foreground">{plan.tagline}</div>
      </div>

      <div>
        <span
          className={cn(
            "font-heading font-bold",
            plan.dark ? "text-[22px] leading-tight text-white" : "text-[32px] text-foreground",
          )}
        >
          {plan.price}
        </span>
        {plan.priceSuffix && (
          <span className="text-sm text-meta">{plan.priceSuffix}</span>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {plan.features.map((feature) => (
          <div
            key={feature.label}
            className={cn(
              "flex items-center gap-2.5 text-sm",
              plan.dark ? "text-[#A9A39A]" : "text-text-secondary",
              !feature.included && "text-[#C4BFB8]",
            )}
          >
            <Check
              className={cn(
                "size-4 flex-shrink-0",
                feature.included ? "text-primary" : "text-[#C4BFB8]",
              )}
              strokeWidth={2.5}
            />
            {feature.label}
          </div>
        ))}
      </div>

      <Link
        href={plan.cta.href}
        className={cn(
          "mt-auto block rounded-[10px] py-3 text-center text-sm font-semibold transition-colors",
          plan.popular || plan.dark
            ? "bg-primary text-white hover:bg-primary-hover"
            : "border-[1.5px] border-border text-text-secondary hover:border-primary hover:text-primary",
        )}
      >
        {plan.cta.label}
      </Link>
    </div>
  );
}
