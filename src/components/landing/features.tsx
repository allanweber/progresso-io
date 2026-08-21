import Image from "next/image";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { features, showcase, type Feature } from "@/lib/landing-content";

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

        {/*
          The screenshots come first. A grid of nine icon cards describes the
          product; it does not show it, and a coach deciding whether this builds
          the plans they build cannot tell from an icon.
        */}
        <div className="mb-20 flex flex-col gap-16 lg:gap-24">
          {showcase.map((item, index) => (
            <div
              key={item.title}
              className="grid items-center gap-8 lg:grid-cols-12 lg:gap-14"
            >
              {/*
                The copy comes FIRST in the DOM, which is what a phone gets: a
                stacked screenshot with its heading underneath is an unlabelled
                picture, and the reader has to look at it before being told what
                they are looking at. `lg:order-*` then alternates the sides on a
                wide screen, where both halves are visible at once.
              */}
              <div
                className={cn(
                  "lg:col-span-5",
                  index % 2 === 0 ? "lg:order-2" : "lg:order-1",
                )}
              >
                <h3 className="mb-3 font-heading text-[clamp(22px,2.6vw,28px)] font-bold leading-tight tracking-[-0.02em] text-foreground">
                  {item.title}
                </h3>
                <p className="text-[15px] leading-[1.7] text-text-secondary">
                  {item.description}
                </p>
              </div>

              <div
                className={cn(
                  "lg:col-span-7",
                  index % 2 === 0 ? "lg:order-1" : "lg:order-2",
                )}
              >
                <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_18px_44px_rgba(15,23,42,0.13)]">
                  <Image
                    src={item.image}
                    alt={item.alt}
                    width={1040}
                    height={520}
                    // Below the fold, all of them: let the browser defer these
                    // so they never compete with the hero.
                    loading="lazy"
                    // `unoptimized` on purpose. These are already optimized
                    // artifacts: captured at 2x and compressed by
                    // `npm run landing:optimize`, at the size they are shown.
                    // Sending them through Next's optimizer only re-encodes
                    // them — and worse, a declared width of 1040 puts the 2x
                    // candidate at 2080, just over the 2048 device size, so it
                    // jumped to w=3840 and UPSCALED a 2080px source. That
                    // request was still in flight a minute later.
                    unoptimized

                    // No `sizes` on purpose. With one, the browser sized the
                    // srcset against the viewport and asked for the w=3840
                    // candidate — Next then UPSCALES a 2080px source to 3840,
                    // which is slow enough that the request was still in flight
                    // a minute later and is worse than the image it replaces.
                    // Without it, Next emits 1x/2x of the declared width, which
                    // is what these actually render at.
                    className="block h-auto w-full"
                  />
                </div>
              </div>

            </div>
          ))}
        </div>

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
