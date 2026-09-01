"use client";

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { apiFetch } from "@/lib/api-client";

/**
 * Fires the one-shot starter seed on the coach's first sign-in. The server owns
 * once-only execution (a durable `clinic.starters_seeded_at` flag + advisory
 * lock), so this is safe to POST unconditionally — but we also gate on the
 * `seeded` flag the layout already knows, so after the first time the client
 * makes ZERO calls: the effect never runs and nothing renders.
 *
 * While the seed runs it shows a small non-blocking banner; when it completes it
 * invalidates every query so the freshly-seeded diet/workout library refetches.
 */
export function StartersEnsure({ seeded }: { seeded: boolean }) {
  const queryClient = useQueryClient();

  const ensure = useMutation({
    mutationFn: () =>
      apiFetch<{ seeded: boolean; startersSeededAt: string | null }>(
        "/api/clinic/starters/ensure",
        { method: "POST" },
      ),
    onSuccess: (data) => {
      // Only a run that actually seeded needs a refetch; a no-op changes nothing.
      if (data.seeded) queryClient.invalidateQueries();
    },
  });

  useEffect(() => {
    if (!seeded) ensure.mutate();
    // Fire exactly once on mount; the server guarantees once-only seeding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nothing to show once the clinic is seeded, or while a no-op call settles.
  if (seeded || !ensure.isPending) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-body-dense font-medium text-foreground shadow-overlay">
      <Sparkles className="size-4 animate-pulse text-primary" />
      Preparando seus modelos de dieta e treino…
    </div>
  );
}
