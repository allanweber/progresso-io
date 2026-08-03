import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("mx-auto max-w-[600px] text-center", className)}>
      <Badge className="mb-4">{eyebrow}</Badge>
      <h2 className="mb-3.5 font-heading text-[clamp(28px,3.5vw,40px)] font-bold leading-[1.15] tracking-[-0.025em] text-foreground">
        {title}
      </h2>
      {description && (
        <p className="text-[clamp(16px,2vw,19px)] leading-[1.65] text-text-secondary">
          {description}
        </p>
      )}
    </div>
  );
}
