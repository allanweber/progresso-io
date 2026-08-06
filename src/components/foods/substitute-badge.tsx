import { ArrowLeftRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * A small labeled pill showing how many substitutes a food has. Renders nothing
 * when there are none. Reused by the coach and admin food listings so the
 * indicator reads the same everywhere ("3 substitutos").
 */
export function SubstituteBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge
      variant="base"
      className="shrink-0 font-medium"
      title={`${count} substituto${count === 1 ? "" : "s"} cadastrado${count === 1 ? "" : "s"}`}
    >
      <ArrowLeftRight className="size-3" />
      {count} {count === 1 ? "substituto" : "substitutos"}
    </Badge>
  );
}
