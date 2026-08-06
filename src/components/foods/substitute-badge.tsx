import { ArrowLeftRight } from "lucide-react";

/**
 * A small labeled pill showing how many substitutes a food has. Renders nothing
 * when there are none. Reused by the coach and admin food listings so the
 * indicator reads the same everywhere ("3 substitutos") instead of a bare icon.
 */
export function SubstituteBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#EEF2FF] px-2 py-0.5 text-xs font-medium text-[#4338CA]"
      title={`${count} substituto${count === 1 ? "" : "s"} cadastrado${count === 1 ? "" : "s"}`}
    >
      <ArrowLeftRight className="size-3" />
      {count} {count === 1 ? "substituto" : "substitutos"}
    </span>
  );
}
