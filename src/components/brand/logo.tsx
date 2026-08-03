import { cn } from "@/lib/utils";

type LogoProps = {
  /** Size of the square mark in pixels. */
  size?: number;
  /** Text color of the wordmark. */
  className?: string;
  /** Hide the "Progresso IO" wordmark, showing only the mark. */
  markOnly?: boolean;
};

export function Logo({ size = 32, className, markOnly }: LogoProps) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex items-center justify-center rounded-lg bg-primary font-heading font-bold text-primary-foreground"
        style={{ width: size, height: size, fontSize: size * 0.47 }}
      >
        P
      </span>
      {!markOnly && (
        <span
          className={cn(
            "font-heading text-base font-bold text-foreground",
            className,
          )}
        >
          Progresso IO
        </span>
      )}
    </span>
  );
}
