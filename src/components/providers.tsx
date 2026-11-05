"use client";

import { useState } from "react";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

/**
 * App-wide client providers. Wraps everything in a TanStack Query client — the
 * single channel every page uses to talk to the backend (all page↔backend
 * traffic goes through the API + TanStack Query; see AGENTS.md). The client is
 * created once per browser session via `useState` so it survives re-renders.
 *
 * On sign-out the cache is cleared (`queryClient.clear()`) so no tenant data
 * lingers across account switches — see the sign-out control in the dashboard.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client: QueryClient = new QueryClient({
      mutationCache: new MutationCache({
        onSuccess: () => {
          void client.invalidateQueries({
            queryKey: ["coach-wa-waiting-count"],
          });
          client.removeQueries({
            queryKey: ["coach-whatsapp"],
            type: "inactive",
          });
        },
      }),
      defaultOptions: {
        queries: {
          // Tenant data changes on the server (other coaches, invites); keep
          // it modestly fresh and refetch on focus for a live-feeling roster.
          staleTime: 30_000,
          retry: 1,
        },
      },
    });
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
