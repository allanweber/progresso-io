import { cn } from "@/lib/utils";

type LogoProps = {
  /** Size of the square mark in pixels. */
  size?: number;
  /** Extra classes for the wordmark. */
  className?: string;
  /** Hide the "Progresso IO" wordmark, showing only the mark. */
  markOnly?: boolean;
  /** Inverted treatment for dark/green surfaces: white mark, green "P", white text. */
  inverted?: boolean;
};

export function Logo({ size = 32, className, markOnly, inverted }: LogoProps) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          "flex items-center justify-center rounded-lg font-heading font-bold",
          inverted ? "bg-white text-primary" : "bg-primary text-primary-foreground",
        )}
        style={{ width: size, height: size, fontSize: size * 0.47 }}
      >
        P
      </span>
      {!markOnly && (
        <span
          className={cn(
            "font-heading text-base font-bold",
            inverted ? "text-white" : "text-foreground",
            className,
          )}
        >
          Progresso IO
        </span>
      )}
    </span>
  );
}
