"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/**
 * A star toggle that marks/unmarks a food as the clinic's favorite. Reused by
 * the listing (rows and cards) and the food detail page, so it owns the
 * PUT/DELETE mutation and its own optimistic state. It calls `stopPropagation`
 * so tapping the star never triggers the surrounding row/card navigation.
 */
export function FavoriteButton({
  foodId,
  isFavorite,
  size = "sm",
}: {
  foodId: string;
  isFavorite: boolean;
  size?: "sm" | "md";
}) {
  const queryClient = useQueryClient();
  const [fav, setFav] = useState(isFavorite);

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      apiFetch(`/api/foods/${foodId}/favorite`, {
        method: next ? "PUT" : "DELETE",
      }),
    onMutate: (next) => setFav(next),
    // Revert the optimistic flip if the request fails.
    onError: (_error, next) => setFav(!next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["foods"] });
      queryClient.invalidateQueries({ queryKey: ["food", foodId] });
    },
  });

  const icon = size === "md" ? "size-5" : "size-4";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutation.mutate(!fav);
      }}
      aria-pressed={fav}
      aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      title={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      className="inline-flex shrink-0 items-center justify-center rounded-full p-1 transition-colors hover:bg-[#FEF3C7]/60"
    >
      <Star
        className={cn(
          icon,
          "transition-colors",
          fav ? "fill-amber-400 text-amber-400" : "text-[#CBD5E1]",
        )}
      />
    </button>
  );
}
